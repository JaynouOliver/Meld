import Foundation
import WebKit

struct APIError: LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { message }
}

/// The data API (docs/DESIGN_SYSTEM.md §11): `POST /api/rpc/<method>` with `{"args": [...]}`,
/// answered with `{"result": …}` or `{"error": "…"}`.
///
/// Auth: the access token goes as `Authorization: Bearer` (src/server/auth.ts). The same
/// session is also kept as the web's auth cookie in the shared cookie store, which the
/// server accepts too; that keeps the app working against a server that doesn't read the
/// Bearer header yet, and it signs in the embedded web pages.
@MainActor
final class MeldAPI {
    private let session: URLSession
    private let tokenProvider: () async -> String?

    init(tokenProvider: @escaping () async -> String?) {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared
        config.httpShouldSetCookies = true
        self.session = URLSession(configuration: config)
        self.tokenProvider = tokenProvider
    }

    func call<T: Decodable>(_ method: String, _ args: [Any] = [], as type: T.Type = T.self) async throws -> T {
        var req = URLRequest(url: Config.webURL.appending(path: "api/rpc/\(method)"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(Self.clientId, forHTTPHeaderField: "x-meld-client")
        if let token = await tokenProvider() { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        req.httpBody = try JSONSerialization.data(withJSONObject: ["args": args])

        let (data, response) = try await session.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let err = try? JSONDecoder().decode(ErrorBody.self, from: data)
            throw APIError(status: status, message: err?.error ?? "Meld didn't respond. Check your connection and try again.")
        }
        do {
            return try JSONDecoder().decode(Envelope<T>.self, from: data).result
        } catch {
            throw APIError(status: status, message: "Unexpected answer from Meld (\(method)).")
        }
    }

    /// Calls whose result we don't need.
    func send(_ method: String, _ args: [Any] = []) async throws {
        _ = try await call(method, args, as: Ignored?.self)
    }

    /// "Try the demo": a throwaway account in a private copy of the demo company.
    /// The response also sets the active-workspace cookie in the shared store.
    func createDemo() async throws -> (email: String, password: String) {
        var req = URLRequest(url: Config.webURL.appending(path: "api/demo"))
        req.httpMethod = "POST"
        let (data, response) = try await session.data(for: req)
        struct Demo: Decodable { let credentials: Creds?; let error: String? }
        struct Creds: Decodable { let email: String; let password: String }
        let demo = try? JSONDecoder().decode(Demo.self, from: data)
        guard let c = demo?.credentials else {
            throw APIError(status: (response as? HTTPURLResponse)?.statusCode ?? 0, message: demo?.error ?? "Couldn't start the demo. Please try again.")
        }
        return (c.email, c.password)
    }

    /// Identifies this app instance in realtime pings, so it can skip its own changes.
    static let clientId = "mac-\(UUID().uuidString.prefix(8))"

    /// `result` may be null; decoding it as an Optional T handles that.
    private struct Envelope<T: Decodable>: Decodable { let result: T }
    private struct ErrorBody: Decodable { let error: String }

    struct Ignored: Decodable {
        init(from decoder: Decoder) throws {}
    }
}

/// The session as the web's `sb-…-auth-token` cookie ("base64-" + base64url(session JSON),
/// split into .0/.1… past 3180 characters, like @supabase/ssr), in both cookie stores:
/// URLSession's (API calls) and WebKit's (embedded pages).
@MainActor
enum SessionCookies {
    private static let chunkSize = 3180

    /// Finishes when WebKit has the current cookies; embedded pages wait on it.
    private(set) static var webReady: Task<Void, Never> = Task {}

    /// URLSession's store is set at once (API calls need it now). WebKit's store is set in
    /// the background: its first use starts WebKit's networking process, which takes seconds.
    static func install(_ session: AuthSession) async {
        let cookies = authCookies(for: session)
        for c in HTTPCookieStorage.shared.cookies ?? [] where c.name.hasPrefix(Config.authCookieName) {
            HTTPCookieStorage.shared.deleteCookie(c)
        }
        for c in cookies { HTTPCookieStorage.shared.setCookie(c) }
        let previous = webReady
        webReady = Task {
            await previous.value
            let wk = WKWebsiteDataStore.default().httpCookieStore
            for c in await wk.allCookies() where c.name.hasPrefix(Config.authCookieName) { await wk.deleteCookie(c) }
            for c in cookies { await wk.setCookie(c) }
        }
    }

    private static func authCookies(for session: AuthSession) -> [HTTPCookie] {
        let value = "base64-" + session.raw.base64URLEncoded()
        var parts: [(String, String)] = []
        if value.count <= chunkSize {
            parts = [(Config.authCookieName, value)]
        } else {
            var i = 0, start = value.startIndex
            while start < value.endIndex {
                let end = value.index(start, offsetBy: chunkSize, limitedBy: value.endIndex) ?? value.endIndex
                parts.append(("\(Config.authCookieName).\(i)", String(value[start..<end])))
                start = end; i += 1
            }
        }
        return parts.compactMap { name, v in
            var props: [HTTPCookiePropertyKey: Any] = [
                .name: name, .value: v, .domain: Config.webURL.host() ?? "", .path: "/",
                .expires: Date().addingTimeInterval(400 * 24 * 3600), .sameSitePolicy: "Lax",
            ]
            if Config.webURL.scheme == "https" { props[.secure] = "TRUE" }
            return HTTPCookie(properties: props)
        }
    }

    /// The active-workspace cookie is set by the server on API responses; copy it to WebKit
    /// so embedded pages show the same workspace.
    static func syncWorkspaceCookie() async {
        let others = (HTTPCookieStorage.shared.cookies(for: Config.webURL) ?? []).filter { !$0.name.hasPrefix(Config.authCookieName) }
        let previous = webReady
        webReady = Task {
            await previous.value
            let wk = WKWebsiteDataStore.default().httpCookieStore
            for c in others { await wk.setCookie(c) }
        }
    }

    static func clear() async {
        for c in HTTPCookieStorage.shared.cookies ?? [] where c.domain.contains(Config.webURL.host() ?? "-") {
            HTTPCookieStorage.shared.deleteCookie(c)
        }
        await WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast)
    }
}
