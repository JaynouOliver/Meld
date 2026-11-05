import Foundation

/// A Supabase session, as the token endpoint returns it. `raw` keeps the exact JSON so it
/// can be handed to the web app as its auth cookie.
struct AuthSession: Sendable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date
    let user: MeldUser
    let raw: Data

    init(json: Data) throws {
        let p = try JSONDecoder().decode(Payload.self, from: json)
        accessToken = p.access_token
        refreshToken = p.refresh_token
        if let at = p.expires_at {
            expiresAt = Date(timeIntervalSince1970: at)
        } else {
            expiresAt = Date().addingTimeInterval(p.expires_in ?? 3600)
        }
        user = MeldUser(p.user)
        // Make sure expires_at is present: the web client relies on it.
        if p.expires_at == nil, var obj = try JSONSerialization.jsonObject(with: json) as? [String: Any] {
            obj["expires_at"] = Int(expiresAt.timeIntervalSince1970)
            raw = try JSONSerialization.data(withJSONObject: obj)
        } else {
            raw = json
        }
    }

    var isExpiringSoon: Bool { expiresAt.timeIntervalSinceNow < 120 }

    private struct Payload: Decodable {
        let access_token: String
        let refresh_token: String
        let expires_in: Double?
        let expires_at: Double?
        let user: UserPayload
    }

    struct UserPayload: Decodable {
        let id: String
        let email: String?
        let user_metadata: [String: JSONValue]?
    }
}

struct MeldUser: Sendable, Equatable {
    let id: String
    let email: String?
    let name: String
    let avatarURL: URL?

    /// Mirrors `toSessionUser` in src/lib/auth/shared.ts (GitHub and Google name fields differently).
    init(_ u: AuthSession.UserPayload) {
        let m = u.user_metadata ?? [:]
        let pick = { (keys: [String]) -> String? in
            keys.lazy.compactMap { m[$0]?.string }.first { !$0.isEmpty }
        }
        id = u.id
        email = u.email
        name = pick(["full_name", "name", "user_name", "preferred_username"]) ?? u.email?.components(separatedBy: "@").first ?? "New user"
        avatarURL = pick(["avatar_url", "picture"]).flatMap(URL.init(string:))
    }

    var firstName: String { name.components(separatedBy: " ").first ?? name }
    var initials: String {
        name.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }
}

/// Just enough JSON to read user metadata.
enum JSONValue: Decodable, Sendable {
    case string(String), number(Double), bool(Bool), other

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self) { self = .string(s) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else { self = .other }
    }

    var string: String? { if case .string(let s) = self { s } else { nil } }
}
