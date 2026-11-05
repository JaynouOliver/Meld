import SwiftUI
import WebKit

/// The signed-in workspace: the Meld web app itself, so the Mac app and the website share
/// one design language. The window adds only Mac things around it: back/forward/reload,
/// the Account menu, notifications and the Dock badge (WorkspaceStore).
struct WorkspaceWebView: View {
    @Environment(AppModel.self) private var model
    let store: WorkspaceStore
    @State private var web = WebController()

    var body: some View {
        ZStack(alignment: .top) {
            WebView(controller: web)
                .opacity(web.firstPaint ? 1 : 0)
            if !web.firstPaint { LoadingView() }
            if web.isLoading && web.firstPaint { WorkingBar() }
        }
        .background(Palette.background)
        .toolbar {
            ToolbarItemGroup(placement: .navigation) {
                Button { web.view.goBack() } label: { Image(systemName: "chevron.left") }
                    .disabled(!web.canGoBack)
                    .help("Back")
                Button { web.view.goForward() } label: { Image(systemName: "chevron.right") }
                    .disabled(!web.canGoForward)
                    .help("Forward")
            }
            ToolbarItem(placement: .primaryAction) {
                Button { web.view.reload() } label: { Image(systemName: "arrow.clockwise") }
                    .help("Reload")
            }
        }
        .navigationTitle(web.title)
        .task {
            let model = model, store = store, web = web
            web.onSignedOut = { [weak model] in model?.signOut() }
            web.onSessionLost = { [weak model] in Task { await model?.restoreWebSession() } }
            web.onSessionGone = { [weak model] in model?.signOut(message: "Your session ended. Please sign in again.") }
            web.onPage = { [weak store] url in store?.pageChanged(url) }
            store.openChat = { [weak web] chat in web?.load(path: "/chat/\(chat)") }
            if let accent = model.takePendingAccent() { web.seedAccent(accent.rawValue) }
            await SessionCookies.webReady.value
            web.load(path: "/app")
        }
        .focusedSceneValue(\.webActions, WebActions(
            reload: { web.view.reload() },
            back: { web.view.goBack() },
            forward: { web.view.goForward() }))
    }
}

/// The mark on the canvas while the web app's first page loads.
private struct LoadingView: View {
    var body: some View {
        ZStack {
            Palette.canvas.ignoresSafeArea()
            VStack(spacing: 16) {
                MeldMark().fill(Color.meldBlue).frame(width: 40, height: 40)
                WorkingBar().frame(width: 120)
            }
        }
    }
}

/// Menu commands (reload, back, forward) reach the web view through this.
struct WebActions {
    var reload: () -> Void
    var back: () -> Void
    var forward: () -> Void
}

struct WebActionsKey: FocusedValueKey { typealias Value = WebActions }

extension FocusedValues {
    var webActions: WebActions? {
        get { self[WebActionsKey.self] }
        set { self[WebActionsKey.self] = newValue }
    }
}

// MARK: - Web view

@MainActor
@Observable
final class WebController: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    let view: WKWebView
    var isLoading = false
    var firstPaint = false
    var title = "Meld"
    var canGoBack = false
    var canGoForward = false
    @ObservationIgnored var onSignedOut: (() -> Void)?
    @ObservationIgnored var onSessionLost: (() -> Void)?
    @ObservationIgnored var onSessionGone: (() -> Void)?
    @ObservationIgnored var onPage: ((URL) -> Void)?
    @ObservationIgnored private var observers: [NSKeyValueObservation] = []
    @ObservationIgnored private var lastLoginBounce: Date?

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.applicationNameForUserAgent = "MeldMac/0.3"
        view = WKWebView(frame: .zero, configuration: config)
        view.allowsBackForwardNavigationGestures = true
        view.allowsMagnification = true
        view.setValue(false, forKey: "drawsBackground")
        super.init()
        // The web's sign-out (src/lib/auth/browser.ts) posts to /auth/signout: tell the app.
        let signOutHook = """
        (function(){const f=window.fetch;window.fetch=function(i,o){try{const u=typeof i==="string"?i:i.url;if(u&&u.indexOf("/auth/signout")>=0)window.webkit.messageHandlers.meld.postMessage("signedOut");}catch(e){}return f.apply(this,arguments);};})();
        """
        config.userContentController.addUserScript(WKUserScript(source: signOutHook, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(WeakScriptHandler(self), name: "meld")
        view.navigationDelegate = self
        view.uiDelegate = self
        observers = [
            view.observe(\.isLoading) { [weak self] v, _ in MainActor.assumeIsolated { self?.isLoading = v.isLoading } },
            view.observe(\.title) { [weak self] v, _ in MainActor.assumeIsolated { self?.title = Self.cleanTitle(v.title) } },
            view.observe(\.canGoBack) { [weak self] v, _ in MainActor.assumeIsolated { self?.canGoBack = v.canGoBack } },
            view.observe(\.canGoForward) { [weak self] v, _ in MainActor.assumeIsolated { self?.canGoForward = v.canGoForward } },
            view.observe(\.url) { [weak self] v, _ in MainActor.assumeIsolated { if let u = v.url { self?.onPage?(u) } } },
        ]
    }

    func load(path: String) {
        view.load(URLRequest(url: Config.webURL.appending(path: path)))
    }

    /// The accent chosen during onboarding, written into the web app's saved preferences
    /// (zustand "meld-ui", v2) before its first page loads. After that the web's own
    /// accent picker owns it.
    func seedAccent(_ hex: String) {
        let js = """
        try{var k="meld-ui",j=JSON.parse(localStorage.getItem(k)||"{}");j.state=j.state||{};j.state.accent=\(Self.jsString(hex));j.version=j.version||2;localStorage.setItem(k,JSON.stringify(j));}catch(e){}
        """
        view.configuration.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    nonisolated func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        MainActor.assumeIsolated {
            if message.body as? String == "signedOut" { onSignedOut?() }
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        firstPaint = true
    }

    /// Meld pages stay here; the landing page and /login mean the session ended; everything
    /// else (GitHub PRs, docs…) opens in the browser.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url else { return .cancel }
        if url.host() == Config.webURL.host() {
            let path = url.path()
            if path == "/" || path.isEmpty {
                onSignedOut?() // the web app only goes to "/" after signing out
                return .cancel
            }
            if path == "/login" {
                // Lost its cookie: restore it once; a second bounce within a minute means
                // the session is really gone.
                let again = lastLoginBounce.map { Date().timeIntervalSince($0) < 60 } ?? false
                lastLoginBounce = Date()
                if again { onSessionGone?() } else { onSessionLost?() }
                return .cancel
            }
            return .allow
        }
        if ["about", "blob", "data"].contains(url.scheme ?? "") || action.targetFrame?.isMainFrame == false { return .allow }
        NSWorkspace.shared.open(url)
        return .cancel
    }

    // target="_blank" links.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if url.host() == Config.webURL.host() { webView.load(action.request) } else { NSWorkspace.shared.open(url) }
        }
        return nil
    }

    private static func cleanTitle(_ t: String?) -> String {
        guard let t, !t.isEmpty else { return "Meld" }
        return t.replacingOccurrences(of: " · Meld", with: "")
    }

    private static func jsString(_ s: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [s])
        return data.flatMap { String(data: $0, encoding: .utf8) }.map { String($0.dropFirst().dropLast()) } ?? "\"\""
    }
}

/// WKUserContentController retains its handlers; this keeps the controller from leaking.
private final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(c, didReceive: message)
    }
}

struct WebView: NSViewRepresentable {
    let controller: WebController
    func makeNSView(context: Context) -> WKWebView { controller.view }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
