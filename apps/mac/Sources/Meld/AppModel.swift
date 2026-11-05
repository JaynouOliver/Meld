import AppKit
import Observation
import SwiftUI

/// Where the user is: first-run onboarding (welcome → sign in → workspace → team →
/// notifications), or the app. Owns the session and the API client.
@MainActor
@Observable
final class AppModel {
    enum Phase: Equatable {
        case launching
        case welcome
        case signIn
        case setup(SetupStep)
        case main
    }

    enum SetupStep: Int, Equatable { case workspace = 3, team = 4, notifications = 5 }

    enum SignInState: Equatable {
        case idle
        case waitingForBrowser(OAuthProvider)
        case finishing
        case startingDemo
        case emailBusy
        /// Signed up; the account needs the confirmation link sent to this address.
        case checkEmail(String)
    }

    private(set) var phase: Phase = .launching
    var signIn: SignInState = .idle
    var errorMessage: String?
    private(set) var session: AuthSession?
    private(set) var workspace: WorkspaceStore?
    /// The workspace accent (Cobalt by default), applied as the app's tint.
    var accent: Accent {
        didSet { UserDefaults.standard.set(accent.rawValue, forKey: "meld.accent") }
    }
    /// Set when onboarding creates a workspace: the web app starts with this accent.
    @ObservationIgnored private var pendingAccent: Accent?

    func takePendingAccent() -> Accent? {
        defer { pendingAccent = nil }
        return pendingAccent
    }

    func markAccentChosen() { pendingAccent = accent }

    /// The web view lost its cookie: write the session into it again and reload the app.
    func restoreWebSession() async {
        guard let s = await validSession() else { return }
        await SessionCookies.install(s)
        await SessionCookies.webReady.value
        let ws = workspace
        workspace = nil
        workspace = ws
    }

    @ObservationIgnored private(set) lazy var api = MeldAPI { [weak self] in await self?.validSession()?.accessToken }

    private static let seenWelcomeKey = "meld.hasSeenWelcome"
    private static let verifierKey = "meld.pkceVerifier"

    init() {
        accent = Accent(rawValue: UserDefaults.standard.string(forKey: "meld.accent") ?? "") ?? .cobalt
        if let data = Keychain.load(), let s = try? AuthSession(json: data) {
            session = s
            Task { await afterSignIn(firstTime: false) }
        } else {
            phase = UserDefaults.standard.bool(forKey: Self.seenWelcomeKey) ? .signIn : .welcome
        }
    }

    var user: MeldUser? { session?.user }

    // MARK: Onboarding navigation

    func go(_ p: Phase) {
        errorMessage = nil
        phase = p
    }

    func getStarted() {
        UserDefaults.standard.set(true, forKey: Self.seenWelcomeKey)
        go(.signIn)
    }

    func backToWelcome() {
        signIn = .idle
        go(.welcome)
    }

    // MARK: Sign-in

    func signIn(with provider: OAuthProvider) {
        errorMessage = nil
        let verifier = AuthClient.makeVerifier()
        UserDefaults.standard.set(verifier, forKey: Self.verifierKey)
        NSWorkspace.shared.open(AuthClient.authorizeURL(provider: provider, verifier: verifier))
        signIn = .waitingForBrowser(provider)
        if phase != .signIn { phase = .signIn }
    }

    func reopenBrowser() {
        if case .waitingForBrowser(let p) = signIn { signIn(with: p) }
    }

    func cancelSignIn() {
        UserDefaults.standard.removeObject(forKey: Self.verifierKey)
        signIn = .idle
    }

    /// Email and password, for accounts made that way (on the web or here).
    func signIn(email: String, password: String) {
        errorMessage = nil
        signIn = .emailBusy
        Task {
            do {
                let s = try await AuthClient.password(email: email.trimmingCharacters(in: .whitespaces), password: password)
                await store(s)
                await afterSignIn(firstTime: true)
            } catch {
                fail(error.localizedDescription)
            }
        }
    }

    /// Create an account. With email confirmation on, the link in the email opens the app
    /// (meld://auth/callback) and finishes signing in like Google/GitHub.
    func signUp(name: String, email: String, password: String) {
        errorMessage = nil
        signIn = .emailBusy
        let address = email.trimmingCharacters(in: .whitespaces)
        let verifier = AuthClient.makeVerifier()
        UserDefaults.standard.set(verifier, forKey: Self.verifierKey)
        Task {
            do {
                switch try await AuthClient.signUp(email: address, password: password, name: name, verifier: verifier) {
                case .signedIn(let s):
                    await store(s)
                    await afterSignIn(firstTime: true)
                case .confirmEmail:
                    signIn = .checkEmail(address)
                }
            } catch {
                fail(error.localizedDescription)
            }
        }
    }

    /// "Try the demo": a private copy of the demo company, no account needed.
    func tryDemo() {
        UserDefaults.standard.set(true, forKey: Self.seenWelcomeKey)
        errorMessage = nil
        signIn = .startingDemo
        Task {
            do {
                let creds = try await api.createDemo()
                let s = try await AuthClient.password(email: creds.email, password: creds.password)
                await store(s)
                await afterSignIn(firstTime: true)
            } catch {
                fail(error.localizedDescription)
            }
        }
    }

    /// meld://auth/callback?code=… (or ?error=…), from the site's /auth/desktop page.
    func handle(url: URL) {
        guard url.scheme == Config.callbackScheme else { return }
        NSApp.activate()
        if url.host() == "chat", let id = url.pathComponents.filter({ $0 != "/" }).first {
            workspace?.open(chat: id)
            return
        }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let value = { (name: String) in items.first { $0.name == name }?.value }
        if let err = value("error_description") ?? value("error") {
            fail(err.replacingOccurrences(of: "+", with: " "))
            return
        }
        guard let code = value("code"), let verifier = UserDefaults.standard.string(forKey: Self.verifierKey) else {
            fail("That sign-in link has expired. Please try again.")
            return
        }
        signIn = .finishing
        Task {
            do {
                let s = try await AuthClient.exchange(code: code, verifier: verifier)
                UserDefaults.standard.removeObject(forKey: Self.verifierKey)
                await store(s)
                await afterSignIn(firstTime: true)
            } catch {
                fail(error.localizedDescription)
            }
        }
    }

    private func fail(_ message: String) {
        errorMessage = message
        signIn = .idle
        if phase != .signIn && phase != .welcome { phase = .signIn }
    }

    /// Load the directory and route: set up a workspace, meet the team, or straight in.
    func afterSignIn(firstTime: Bool) async {
        guard let s = await validSession() else { return }
        await SessionCookies.install(s)
        do {
            let dir = try await api.call("getDirectory", as: Directory?.self)
            await SessionCookies.syncWorkspaceCookie()
            signIn = .idle
            guard let dir else {
                phase = .setup(.workspace)
                return
            }
            let ws = WorkspaceStore(api: api, directory: dir)
            workspace = ws
            if !onboarded(s.user.id) {
                phase = .setup(.team)
            } else {
                phase = .main
                ws.start()
            }
        } catch let e as APIError where e.status == 401 {
            signOut(message: "Your session ended. Please sign in again.")
        } catch {
            signIn = .idle
            errorMessage = error.localizedDescription
            // Signed in but offline: keep the session and let them retry.
            phase = .signIn
        }
    }

    /// After creating or joining a workspace.
    func workspaceReady() async {
        await afterSignIn(firstTime: true)
    }

    func finishOnboarding() {
        if let id = user?.id { UserDefaults.standard.set(true, forKey: "meld.onboarded.\(id)") }
        phase = .main
        workspace?.start()
    }

    private func onboarded(_ userId: String) -> Bool {
        UserDefaults.standard.bool(forKey: "meld.onboarded.\(userId)")
    }

    // MARK: Session

    private func store(_ s: AuthSession) async {
        // A different account than last time: drop the web app's saved state (its last
        // chat, cached workspace) so the previous account's data never shows.
        let lastUser = UserDefaults.standard.string(forKey: "meld.lastUserId")
        if lastUser != nil && lastUser != s.user.id { await SessionCookies.clear() }
        UserDefaults.standard.set(s.user.id, forKey: "meld.lastUserId")
        session = s
        Keychain.save(s.raw)
        await SessionCookies.install(s)
    }

    @ObservationIgnored private var refreshing: Task<AuthSession?, Never>?

    /// The session, refreshed first if it's about to expire (one refresh at a time).
    func validSession() async -> AuthSession? {
        guard let s = session else { return nil }
        guard s.isExpiringSoon else { return s }
        if let refreshing { return await refreshing.value }
        let t = Task { () -> AuthSession? in
            do {
                let fresh = try await AuthClient.refresh(s.refreshToken)
                await store(fresh)
                return fresh
            } catch {
                signOut(message: "Your session ended. Please sign in again.")
                return nil
            }
        }
        refreshing = t
        let result = await t.value
        refreshing = nil
        return result
    }

    func signOut(message: String? = nil) {
        if let token = session?.accessToken { Task { await AuthClient.signOut(token) } }
        workspace?.stop()
        workspace = nil
        session = nil
        Keychain.clear()
        Task { await SessionCookies.clear() }
        NSApp.dockTile.badgeLabel = nil
        errorMessage = message
        signIn = .idle
        phase = .signIn
    }
}
