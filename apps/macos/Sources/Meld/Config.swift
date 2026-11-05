import Foundation

/// Where the app talks to. The Supabase key is the public (publishable) key, the same one
/// the web app ships to every browser; it is safe to embed.
enum Config {
    static let supabaseURL = URL(string: "https://twukmsemlxvnchjzaoqf.supabase.co")!
    static let supabaseKey = "sb_publishable_s3KllnmxOanvKcNCnwmwsA_HPe1yXYY"

    /// Supabase's cookie name for this project, shared with the web app (@supabase/ssr).
    static let authCookieName = "sb-twukmsemlxvnchjzaoqf-auth-token"

    /// The web app. Override with MELD_WEB_URL=http://localhost:3000 for local development.
    static let webURL: URL = {
        if let s = ProcessInfo.processInfo.environment["MELD_WEB_URL"], let u = URL(string: s) { return u }
        return URL(string: "https://meld-fawn.vercel.app")!
    }()

    /// The browser sends people back here after sign-in (registered in Info.plist).
    static let callbackScheme = "meld"
    static let callbackURL = "meld://auth/callback"
}
