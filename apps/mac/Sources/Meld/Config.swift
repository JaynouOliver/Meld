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

    /// Where Supabase sends the browser after Google/GitHub: straight back to the app.
    /// Needs `meld://**` in Supabase → Authentication → URL Configuration → Redirect URLs.
    /// MELD_AUTH_BRIDGE_URL instead routes through a web page that opens the app (the
    /// site's /auth/desktop), for projects where that entry can't be added.
    static let authRedirect: String = {
        ProcessInfo.processInfo.environment["MELD_AUTH_BRIDGE_URL"] ?? "meld://auth/callback"
    }()

    /// The app's URL scheme (registered in Info.plist).
    static let callbackScheme = "meld"
}
