import SwiftUI

/// Sign-in: pick Google or GitHub, finish in the browser, come back here automatically.
struct SignInView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ZStack {
            AuroraBackground(palette: [.meldBlue, .meldIndigo, .meldViolet, .meldIndigo, .meldBlue, .meldPink, .meldViolet, .meldBlue, .meldTeal])
            Color.black.opacity(0.08).ignoresSafeArea()

            VStack(spacing: 0) {
                switch model.phase {
                case .waitingForBrowser(let provider):
                    WaitingCard(provider: provider)
                        .transition(.blurReplace)
                case .finishing:
                    FinishingCard()
                        .transition(.blurReplace)
                default:
                    ChooseProviderCard()
                        .transition(.blurReplace)
                }
            }
            .frame(width: 440)
            .padding(36)
            .glassEffect(.regular, in: .rect(cornerRadius: 32))
            .shadow(color: .black.opacity(0.18), radius: 40, y: 20)
        }
    }
}

private struct ChooseProviderCard: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 22) {
            MeldAppIcon(size: 72)
                .padding(.bottom, 4)

            VStack(spacing: 8) {
                Text("Sign in to Meld")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                Text("We'll open your browser so you can sign in securely.\nYou'll come right back here when you're done.")
                    .font(.callout)
                    .multilineTextAlignment(.center)
                    .opacity(0.85)
            }

            VStack(spacing: 12) {
                ProviderButton(provider: .google)
                ProviderButton(provider: .github)
            }
            .padding(.top, 4)

            if let error = model.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.callout)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.leading)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(red: 0.85, green: 0.2, blue: 0.25).opacity(0.75), in: .rect(cornerRadius: 12))
                    .transition(.scale(scale: 0.95).combined(with: .opacity))
            }

            HStack(spacing: 4) {
                Image(systemName: "lock.fill").font(.caption2)
                Text("Your session is stored in your Mac's Keychain.")
            }
            .font(.caption)
            .opacity(0.75)

            Button("What's Meld?") { model.showWelcomeAgain() }
                .buttonStyle(.plain)
                .font(.caption.weight(.medium))
                .underline()
                .opacity(0.85)
        }
        .foregroundStyle(.white)
    }
}

private struct ProviderButton: View {
    @Environment(AppModel.self) private var model
    let provider: OAuthProvider
    @Local private var hovering = false

    var body: some View {
        Button {
            model.signIn(with: provider)
        } label: {
            HStack(spacing: 12) {
                Image(nsImage: provider == .google ? BrandLogo.google : BrandLogo.github)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 20, height: 20)
                Text("Continue with \(provider.title)")
                    .font(.headline)
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .offset(x: hovering ? 2 : 0, y: hovering ? -2 : 0)
            }
            .padding(.horizontal, 18)
            .frame(height: 52)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 16))
        .scaleEffect(hovering ? 1.015 : 1)
        .animation(.spring(duration: 0.3, bounce: 0.4), value: hovering)
        .onHover { hovering = $0 }
    }
}

private struct WaitingCard: View {
    @Environment(AppModel.self) private var model
    let provider: OAuthProvider
    @Local private var pulse = false

    var body: some View {
        VStack(spacing: 22) {
            ZStack {
                Circle()
                    .stroke(.white.opacity(0.5), lineWidth: 2)
                    .frame(width: 96, height: 96)
                    .scaleEffect(pulse ? 1.25 : 0.9)
                    .opacity(pulse ? 0 : 1)
                Image(systemName: "safari.fill")
                    .font(.system(size: 44))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(.white)
                    .frame(width: 84, height: 84)
                    .glassEffect(.regular, in: .circle)
            }
            .onAppear {
                withAnimation(.easeOut(duration: 1.6).repeatForever(autoreverses: false)) { pulse = true }
            }

            VStack(spacing: 8) {
                Text("Continue in your browser")
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                Text("Sign in with \(provider.title) in the browser window we opened. Meld will come back to the front automatically.")
                    .font(.callout)
                    .multilineTextAlignment(.center)
                    .opacity(0.85)
            }

            ProgressView().controlSize(.small)

            HStack(spacing: 10) {
                Button("Cancel") { model.cancelSignIn() }
                    .buttonStyle(.glass)
                Button("Open browser again") { model.reopenBrowser() }
                    .buttonStyle(.glassProminent)
            }
            .controlSize(.large)
        }
        .foregroundStyle(.white)
    }
}

private struct FinishingCard: View {
    var body: some View {
        VStack(spacing: 18) {
            ProgressView().controlSize(.large)
            Text("Signing you in…")
                .font(.title3.weight(.semibold))
        }
        .foregroundStyle(.white)
        .frame(height: 220)
    }
}

/// The short "you're in" moment between sign-in and the workspace.
struct SignedInView: View {
    let user: MeldUser
    @Local private var shown = false

    var body: some View {
        ZStack {
            AuroraBackground(palette: [.meldTeal, .meldBlue, .meldIndigo, .meldBlue, .meldTeal, .meldViolet, .meldIndigo, .meldTeal, .meldBlue])
            VStack(spacing: 20) {
                Avatar(user: user, size: 96)
                    .overlay(alignment: .bottomTrailing) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 30))
                            .symbolRenderingMode(.palette)
                            .foregroundStyle(.white, Color.green)
                            .scaleEffect(shown ? 1 : 0.2)
                            .opacity(shown ? 1 : 0)
                    }
                    .scaleEffect(shown ? 1 : 0.8)
                Text("You're in, \(user.firstName)")
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                Text("Getting your workspace ready…")
                    .font(.title3)
                    .opacity(0.85)
            }
            .foregroundStyle(.white)
            .opacity(shown ? 1 : 0)
        }
        .onAppear {
            withAnimation(.spring(duration: 0.7, bounce: 0.4)) { shown = true }
        }
    }
}

struct Avatar: View {
    let user: MeldUser
    var size: CGFloat = 28

    var body: some View {
        AsyncImage(url: user.avatarURL) { image in
            image.resizable().scaledToFill()
        } placeholder: {
            ZStack {
                LinearGradient(colors: [.meldBlue, .meldViolet], startPoint: .topLeading, endPoint: .bottomTrailing)
                Text(user.initials)
                    .font(.system(size: size * 0.4, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .clipShape(.circle)
        .overlay(Circle().strokeBorder(.white.opacity(0.6), lineWidth: max(1, size / 40)))
    }
}
