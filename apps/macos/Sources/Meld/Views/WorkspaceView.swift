import SwiftUI
import WebKit

/// The signed-in workspace. For now this hosts the Meld web app (same features, same
/// backend), signed in with the session the Mac app got. Native screens replace it piece
/// by piece later.
struct WorkspaceView: View {
    @Environment(AppModel.self) private var model
    let user: MeldUser
    @Local private var web = WebController()
    @Local private var ready = false

    var body: some View {
        ZStack(alignment: .top) {
            WebView(controller: web)
                .opacity(ready ? 1 : 0)

            if !ready || web.isLoading && web.progress < 0.3 {
                LoadingSplash()
                    .transition(.opacity)
            }

            if web.isLoading && ready {
                ProgressView(value: web.progress)
                    .progressViewStyle(.linear)
                    .tint(.meldBlue)
                    .frame(height: 2)
                    .transition(.opacity)
            }
        }
        .animation(.smooth, value: ready)
        .animation(.smooth, value: web.isLoading)
        .toolbar {
            ToolbarItemGroup(placement: .navigation) {
                Button { web.view.goBack() } label: { Image(systemName: "chevron.left") }
                    .disabled(!web.canGoBack)
                    .help("Back")
                Button { web.view.goForward() } label: { Image(systemName: "chevron.right") }
                    .disabled(!web.canGoForward)
                    .help("Forward")
            }
            ToolbarItem(placement: .principal) {
                HStack(spacing: 8) {
                    MeldMark().fill(Color.meldBlue).frame(width: 16, height: 16)
                    Text(web.title.isEmpty ? "Meld" : web.title)
                        .font(.headline)
                        .lineLimit(1)
                }
            }
            ToolbarItemGroup(placement: .primaryAction) {
                Button { web.view.reload() } label: { Image(systemName: "arrow.clockwise") }
                    .help("Reload")
                    .keyboardShortcut("r")
                AccountMenu(user: user, currentURL: web.url)
            }
        }
        .task {
            guard let session = await model.validSession() else { return }
            await WebSession.install(session)
            web.onSignedOut = { model.signOut() }
            web.load(path: "/app")
            ready = true
        }
    }
}

private struct AccountMenu: View {
    @Environment(AppModel.self) private var model
    let user: MeldUser
    let currentURL: URL?
    @Local private var avatar: NSImage?

    var body: some View {
        Menu {
            Section {
                Text(user.name)
                if let email = user.email { Text(email) }
            }
            Button("Open in Browser", systemImage: "safari") {
                NSWorkspace.shared.open(currentURL ?? Config.webURL)
            }
            Divider()
            Button("Sign Out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                model.signOut()
            }
        } label: {
            // Toolbar menus need a fixed-size image; AsyncImage stretches to fill.
            if let avatar {
                Image(nsImage: avatar)
            } else {
                Image(systemName: "person.crop.circle")
            }
        }
        .menuIndicator(.hidden)
        .help(user.name)
        .task(id: user.avatarURL) { avatar = await Self.circleImage(from: user.avatarURL, size: 22) }
    }

    private static func circleImage(from url: URL?, size: CGFloat) async -> NSImage? {
        guard let url, let (data, _) = try? await URLSession.shared.data(from: url),
              let source = NSImage(data: data) else { return nil }
        return NSImage(size: NSSize(width: size, height: size), flipped: false) { rect in
            NSBezierPath(ovalIn: rect).addClip()
            source.draw(in: rect)
            return true
        }
    }
}

private struct LoadingSplash: View {
    @Local private var spin = false

    var body: some View {
        VStack(spacing: 18) {
            MeldAppIcon(size: 64)
                .scaleEffect(spin ? 1.04 : 0.96)
                .animation(.easeInOut(duration: 0.9).repeatForever(), value: spin)
            Text("Loading your workspace…")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.background)
        .onAppear { spin = true }
    }
}

// MARK: - Web view

@MainActor
@Observable
final class WebController: NSObject, WKNavigationDelegate, WKUIDelegate {
    let view: WKWebView
    var isLoading = false
    var progress: Double = 0
    var title = ""
    var url: URL?
    var canGoBack = false
    var canGoForward = false
    @ObservationIgnored var onSignedOut: (() -> Void)?
    @ObservationIgnored private var observers: [NSKeyValueObservation] = []

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.applicationNameForUserAgent = "MeldMac/0.1"
        view = WKWebView(frame: .zero, configuration: config)
        view.allowsBackForwardNavigationGestures = true
        view.allowsMagnification = true
        view.setValue(false, forKey: "drawsBackground")
        super.init()
        view.navigationDelegate = self
        view.uiDelegate = self
        observers = [
            view.observe(\.isLoading) { [weak self] v, _ in MainActor.assumeIsolated { self?.isLoading = v.isLoading } },
            view.observe(\.estimatedProgress) { [weak self] v, _ in MainActor.assumeIsolated { self?.progress = v.estimatedProgress } },
            view.observe(\.title) { [weak self] v, _ in MainActor.assumeIsolated { self?.title = Self.cleanTitle(v.title) } },
            view.observe(\.url) { [weak self] v, _ in MainActor.assumeIsolated { self?.url = v.url } },
            view.observe(\.canGoBack) { [weak self] v, _ in MainActor.assumeIsolated { self?.canGoBack = v.canGoBack } },
            view.observe(\.canGoForward) { [weak self] v, _ in MainActor.assumeIsolated { self?.canGoForward = v.canGoForward } },
        ]
    }

    func load(path: String) {
        view.load(URLRequest(url: Config.webURL.appending(path: path)))
    }

    private static func cleanTitle(_ t: String?) -> String {
        guard let t else { return "" }
        return t.replacingOccurrences(of: " · Meld", with: "").replacingOccurrences(of: " | Meld", with: "")
    }

    // Keep Meld pages in the app; send everything else (GitHub PRs, docs…) to the browser.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url else { return .cancel }
        if url.host() == Config.webURL.host() {
            if url.path() == "/login" {
                onSignedOut?()
                return .cancel
            }
            if url.path() == "/" || url.path().isEmpty {
                // The landing page isn't useful inside the app.
                load(path: "/app")
                return .cancel
            }
            return .allow
        }
        if url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" { return .allow }
        // Supabase realtime and other subresources don't come through here, only navigations.
        if action.targetFrame?.isMainFrame == false { return .allow }
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
}

struct WebView: NSViewRepresentable {
    let controller: WebController
    func makeNSView(context: Context) -> WKWebView { controller.view }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}

/// Hands the Mac app's session to the web app as the same cookie @supabase/ssr writes
/// in a browser ("base64-" + base64url(session JSON), split into .0/.1… past 3180 chars).
@MainActor
enum WebSession {
    private static let chunkSize = 3180

    static func install(_ session: AuthSession) async {
        let store = WKWebsiteDataStore.default().httpCookieStore
        await removeAuthCookies(from: store)

        let value = "base64-" + session.raw.base64URLEncoded()
        let parts: [(String, String)]
        if value.count <= chunkSize {
            parts = [(Config.authCookieName, value)]
        } else {
            parts = stride(from: 0, to: value.count, by: chunkSize).enumerated().map { i, start in
                let s = value.index(value.startIndex, offsetBy: start)
                let e = value.index(s, offsetBy: min(chunkSize, value.count - start))
                return ("\(Config.authCookieName).\(i)", String(value[s..<e]))
            }
        }
        let secure = Config.webURL.scheme == "https"
        for (name, v) in parts {
            var props: [HTTPCookiePropertyKey: Any] = [
                .name: name, .value: v, .domain: Config.webURL.host() ?? "", .path: "/",
                .expires: Date().addingTimeInterval(400 * 24 * 3600),
                .sameSitePolicy: "Lax",
            ]
            if secure { props[.secure] = "TRUE" }
            if let cookie = HTTPCookie(properties: props) { await store.setCookie(cookie) }
        }
    }

    static func clear() {
        let store = WKWebsiteDataStore.default()
        store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) {}
    }

    private static func removeAuthCookies(from store: WKHTTPCookieStore) async {
        for c in await store.allCookies() where c.name.hasPrefix(Config.authCookieName) {
            await store.deleteCookie(c)
        }
    }
}
