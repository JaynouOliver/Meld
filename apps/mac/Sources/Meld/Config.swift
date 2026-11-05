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

    /// Supabase sends the browser here after Google/GitHub. The page (src/app/auth/desktop)
    /// says "You're signed in" and hands the code to the app via meld://auth/callback.
    /// It's a web URL because Supabase already allows the site's URLs as redirects.
    /// Override with MELD_AUTH_BRIDGE_URL to test a local or preview build of that page.
    static let authBridgeURL: URL = {
        if let s = ProcessInfo.processInfo.environment["MELD_AUTH_BRIDGE_URL"], let u = URL(string: s) { return u }
        return webURL.appending(path: "auth/desktop")
    }()

    /// The bridge page opens this to bring the app back (registered in Info.plist).
    static let callbackScheme = "meld"
}
