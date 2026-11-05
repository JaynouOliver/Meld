import AppKit
import Observation
import SwiftUI

/// The app's one source of truth: where the user is in onboarding, and who is signed in.
@MainActor
@Observable
final class AppModel {
    enum Phase: Equatable {
        case welcome            // first-run carousel
        case signIn             // pick Google or GitHub
        case waitingForBrowser(OAuthProvider)
        case finishing          // exchanging the code
        case signedIn(MeldUser) // "You're in" moment, then the workspace
        case workspace(MeldUser)
    }

    private(set) var phase: Phase
    private(set) var session: AuthSession?
    var errorMessage: String?

    private static let seenWelcomeKey = "meld.hasSeenWelcome"
    /// The PKCE verifier lives in UserDefaults so a sign-in still completes if the app was
    /// quit while the browser was open (macOS relaunches it with the callback URL).
    private static let verifierKey = "meld.pkceVerifier"
    private static let providerKey = "meld.pkceProvider"

    init() {
        if let data = Keychain.load(), let s = try? AuthSession(json: data) {
            session = s
            phase = .workspace(s.user)
        } else {
            phase = UserDefaults.standard.bool(forKey: Self.seenWelcomeKey) ? .signIn : .welcome
        }
    }

    // MARK: Onboarding

    func finishWelcome() {
        UserDefaults.standard.set(true, forKey: Self.seenWelcomeKey)
        withAnimation(.smooth(duration: 0.5)) { phase = .signIn }
    }

    func showWelcomeAgain() {
        withAnimation(.smooth(duration: 0.5)) { phase = .welcome }
    }

    // MARK: Sign-in

    func signIn(with provider: OAuthProvider) {
        errorMessage = nil
        let verifier = AuthClient.makeVerifier()
        UserDefaults.standard.set(verifier, forKey: Self.verifierKey)
        UserDefaults.standard.set(provider.rawValue, forKey: Self.providerKey)
        NSWorkspace.shared.open(AuthClient.authorizeURL(provider: provider, verifier: verifier))
        withAnimation(.smooth) { phase = .waitingForBrowser(provider) }
    }

    func reopenBrowser() {
        guard case .waitingForBrowser(let p) = phase else { return }
        signIn(with: p)
    }

    func cancelSignIn() {
        UserDefaults.standard.removeObject(forKey: Self.verifierKey)
        withAnimation(.smooth) { phase = .signIn }
    }

    /// meld://auth/callback?code=… (or ?error=…) from the browser.
    func handle(url: URL) {
        guard url.scheme == Config.callbackScheme else { return }
        NSApp.activate()
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        // Supabase puts errors in the query or, for some failures, the fragment.
        let fragmentItems = URLComponents(string: "x:?\(url.fragment ?? "")")?.queryItems ?? []
        let value = { (name: String) in (items + fragmentItems).first { $0.name == name }?.value }

        if let err = value("error_description") ?? value("error") {
            fail(err.replacingOccurrences(of: "+", with: " "))
            return
        }
        guard let code = value("code"), let verifier = UserDefaults.standard.string(forKey: Self.verifierKey) else {
            fail("That sign-in link has expired. Please try again.")
            return
        }
        withAnimation(.smooth) { phase = .finishing }
        Task {
            do {
                let s = try await AuthClient.exchange(code: code, verifier: verifier)
                UserDefaults.standard.removeObject(forKey: Self.verifierKey)
                store(s)
                withAnimation(.spring(duration: 0.6, bounce: 0.25)) { phase = .signedIn(s.user) }
                try? await Task.sleep(for: .seconds(1.8))
                withAnimation(.smooth(duration: 0.6)) { phase = .workspace(s.user) }
            } catch {
                fail(error.localizedDescription)
            }
        }
    }

    private func fail(_ message: String) {
        errorMessage = message
        withAnimation(.smooth) { phase = .signIn }
    }

    // MARK: Session

    private func store(_ s: AuthSession) {
        session = s
        Keychain.save(s.raw)
    }

    /// A fresh session for the web view, refreshing it first if it's about to expire.
    func validSession() async -> AuthSession? {
        guard let s = session else { return nil }
        guard s.isExpiringSoon else { return s }
        do {
            let fresh = try await AuthClient.refresh(s.refreshToken)
            store(fresh)
            return fresh
        } catch {
            signOut(message: "Your session ended. Please sign in again.")
            return nil
        }
    }

    func signOut(message: String? = nil) {
        if let token = session?.accessToken { Task { await AuthClient.signOut(token) } }
        session = nil
        Keychain.clear()
        WebSession.clear()
        errorMessage = message
        withAnimation(.smooth(duration: 0.5)) { phase = .signIn }
    }
}
