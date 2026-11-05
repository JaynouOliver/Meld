import CryptoKit
import Foundation

enum OAuthProvider: String, CaseIterable, Identifiable, Sendable {
    case google, github
    var id: String { rawValue }
    var title: String { self == .google ? "Google" : "GitHub" }
}

struct AuthError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// Supabase Auth over plain HTTP, using the PKCE flow:
/// 1. `authorizeURL` opens in the user's browser with a code challenge.
/// 2. After Google/GitHub, Supabase redirects to meld://auth/callback?code=…, which macOS
///    hands to the app
/// 3. `exchange` swaps that code (plus the verifier only this app knows) for a session.
enum AuthClient {
    static func makeVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 48)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64URLEncoded()
    }

    static func challenge(for verifier: String) -> String {
        Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncoded()
    }

    static func authorizeURL(provider: OAuthProvider, verifier: String) -> URL {
        var c = URLComponents(url: Config.supabaseURL.appending(path: "auth/v1/authorize"), resolvingAgainstBaseURL: false)!
        c.queryItems = [
            .init(name: "provider", value: provider.rawValue),
            .init(name: "redirect_to", value: Config.authRedirect),
            .init(name: "code_challenge", value: challenge(for: verifier)),
            .init(name: "code_challenge_method", value: "s256"),
        ]
        return c.url!
    }

    static func exchange(code: String, verifier: String) async throws -> AuthSession {
        try await token(grant: "pkce", body: ["auth_code": code, "code_verifier": verifier])
    }

    /// Only for the demo's throwaway account (POST /api/demo returns its credentials).
    static func password(email: String, password: String) async throws -> AuthSession {
        try await token(grant: "password", body: ["email": email, "password": password])
    }

    static func refresh(_ refreshToken: String) async throws -> AuthSession {
        try await token(grant: "refresh_token", body: ["refresh_token": refreshToken])
    }

    static func signOut(_ accessToken: String) async {
        var req = request(path: "auth/v1/logout")
        req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        _ = try? await URLSession.shared.data(for: req)
    }

    private static func token(grant: String, body: [String: String]) async throws -> AuthSession {
        var req = request(path: "auth/v1/token", query: [.init(name: "grant_type", value: grant)])
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let msg = (obj?["error_description"] ?? obj?["msg"] ?? obj?["message"]) as? String
            throw AuthError(message: msg ?? "Sign-in didn't complete. Please try again.")
        }
        return try AuthSession(json: data)
    }

    private static func request(path: String, query: [URLQueryItem] = []) -> URLRequest {
        var c = URLComponents(url: Config.supabaseURL.appending(path: path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { c.queryItems = query }
        var req = URLRequest(url: c.url!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(Config.supabaseKey, forHTTPHeaderField: "apikey")
        return req
    }
}

extension Data {
    func base64URLEncoded() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
