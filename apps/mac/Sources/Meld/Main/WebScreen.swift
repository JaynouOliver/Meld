import SwiftUI
import WebKit

/// Screens not rebuilt natively yet (Home, Missions, Decisions, People, Playbooks, Tickets)
/// show the web page, signed in with the same session. The web's own sidebar is hidden so
/// the native sidebar is the only navigation, and the workspace accent is passed through.
struct WebScreen: View {
    @Environment(AppModel.self) private var model
    let store: WorkspaceStore
    let path: String
    @State private var web = WebController.shared

    var body: some View {
        ZStack(alignment: .top) {
            WebView(controller: web)
                .opacity(web.firstPaint ? 1 : 0)
            if !web.firstPaint { PageSkeleton() }
            if web.isLoading { WorkingBar() }
        }
        .task(id: path) {
            web.onChat = { id in store.screen = .chat(id) }
            web.onSignedOut = { [weak model] in Task { await model?.afterSignIn(firstTime: false) } }
            web.onSessionGone = { [weak model] in model?.signOut(message: "Your session ended. Please sign in again.") }
            web.accent = model.accent.rawValue
            await SessionCookies.webReady.value
            web.load(path: path)
        }
        .onChange(of: model.accent) { _, a in web.setAccent(a.rawValue) }
    }
}

/// Skeleton shaped like a page: header, then rows.
private struct PageSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Skeleton(width: 180, height: 14).padding(.bottom, 10)
            ForEach(0..<8, id: \.self) { _ in
                HStack(spacing: 12) {
                    Skeleton(width: 60, height: 10)
                    Skeleton(height: 10)
                    Skeleton(width: 70, height: 10)
                }
            }
            Spacer()
        }
        .padding(24)
        .background(Palette.background)
    }
}

@MainActor
@Observable
final class WebController: NSObject, WKNavigationDelegate, WKUIDelegate {
    static let shared = WebController()

    let view: WKWebView
    var isLoading = false
    var firstPaint = false
    @ObservationIgnored var onChat: ((ChatId) -> Void)?
    @ObservationIgnored var onSignedOut: (() -> Void)?
    @ObservationIgnored var onSessionGone: (() -> Void)?
    @ObservationIgnored var accent = Accent.cobalt.rawValue
    @ObservationIgnored private var observers: [NSKeyValueObservation] = []
    @ObservationIgnored private var currentPath: String?
    @ObservationIgnored private var lastLoginBounce: Date?

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.applicationNameForUserAgent = "MeldMac/0.2"
        view = WKWebView(frame: .zero, configuration: config)
        view.allowsBackForwardNavigationGestures = true
        view.setValue(false, forKey: "drawsBackground")
        super.init()
        view.navigationDelegate = self
        view.uiDelegate = self
        observers = [
            view.observe(\.isLoading) { [weak self] v, _ in MainActor.assumeIsolated { self?.isLoading = v.isLoading } },
        ]
    }

    func load(path: String) {
        guard path != currentPath else { return }
        currentPath = path
        // Sets the accent in the web app's saved preferences (zustand "meld-ui", v2) before it loads.
        let accentScript = WKUserScript(source: Self.accentJS(accent), injectionTime: .atDocumentStart, forMainFrameOnly: true)
        view.configuration.userContentController.removeAllUserScripts()
        view.configuration.userContentController.addUserScript(accentScript)
        // Hide the web sidebar and phone tab bar: the native sidebar replaces them.
        let css = """
        aside:has(> nav[aria-label="Workspace"]), nav[aria-label="Primary"] { display: none !important; }
        """
        view.configuration.userContentController.addUserScript(WKUserScript(
            source: "const s=document.createElement('style');s.textContent=\(Self.jsString(css));document.documentElement.appendChild(s);",
            injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        if let url = view.url, url.host() == Config.webURL.host() {
            // Same app: navigate client-side-ish by loading the URL (keeps the cache warm).
            view.evaluateJavaScript("window.location.assign(\(Self.jsString(path)))")
        } else {
            view.load(URLRequest(url: Config.webURL.appending(path: path)))
        }
    }

    func setAccent(_ hex: String) {
        accent = hex
        view.evaluateJavaScript(Self.accentJS(hex) + "location.reload();")
    }

    private static func accentJS(_ hex: String) -> String {
        """
        try{var k="meld-ui",j=JSON.parse(localStorage.getItem(k)||"{}");j.state=j.state||{};j.state.accent=\(jsString(hex));j.version=j.version||2;localStorage.setItem(k,JSON.stringify(j));}catch(e){}
        """
    }

    private static func jsString(_ s: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [s])
        return data.flatMap { String(data: $0, encoding: .utf8) }.map { String($0.dropFirst().dropLast()) } ?? "\"\""
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        firstPaint = true
    }

    // Chats open natively; Meld pages stay here; everything else goes to the browser.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url else { return .cancel }
        if url.host() == Config.webURL.host() {
            let parts = url.pathComponents.filter { $0 != "/" }
            if parts.first == "chat", parts.count > 1 {
                onChat?(parts[1])
                return .cancel
            }
            if parts.first == "login" {
                // The page lost its session: refresh the cookies once; a second bounce
                // within a minute means the session is really gone.
                let again = lastLoginBounce.map { Date().timeIntervalSince($0) < 60 } ?? false
                lastLoginBounce = Date()
                currentPath = nil
                if again { onSessionGone?() } else { onSignedOut?() }
                return .cancel
            }
            return .allow
        }
        if ["about", "blob", "data"].contains(url.scheme ?? "") || action.targetFrame?.isMainFrame == false { return .allow }
        NSWorkspace.shared.open(url)
        return .cancel
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if url.host() == Config.webURL.host() { webView.load(action.request) } else { NSWorkspace.shared.open(url) }
        }
        return nil
    }
}

struct WebView: NSViewRepresentable {
    let controller: WebController
    func makeNSView(context: Context) -> WKWebView { controller.view }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
