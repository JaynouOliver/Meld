import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            switch model.phase {
            case .welcome:
                WelcomeView()
                    .transition(.opacity)
            case .signIn, .waitingForBrowser, .finishing:
                SignInView()
                    .transition(.opacity.combined(with: .scale(scale: 1.02)))
            case .signedIn(let user):
                SignedInView(user: user)
                    .transition(.opacity)
            case .workspace(let user):
                WorkspaceView(user: user)
                    .transition(.opacity)
            }
        }
        .animation(.smooth(duration: 0.5), value: model.phase)
    }
}
