import SwiftUI

/// The full-window first run (docs/DESIGN_SYSTEM.md §11): Welcome → Sign in → Workspace →
/// Meet your team → Notifications. The one place Meld is allowed to be warm and a little
/// colorful; the rest of the app stays calm.
struct OnboardingView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var step: Int {
        switch model.phase {
        case .welcome, .launching: 1
        case .signIn: 2
        case .setup(let s): s.rawValue
        case .main: 5
        }
    }

    var body: some View {
        ZStack {
            OnboardingBackdrop()
            VStack(spacing: 0) {
                HStack {
                    MeldLogo(height: 20)
                    Spacer()
                    StepDots(current: step, total: 5)
                }
                .padding(.horizontal, 28)
                .padding(.top, 40) // clear of the traffic lights in the hidden title bar
                .frame(height: 76)

                ZStack {
                    switch model.phase {
                    case .welcome, .launching: WelcomeStep()
                    case .signIn: SignInStep()
                    case .setup(.workspace): WorkspaceStep()
                    case .setup(.team): TeamStep()
                    case .setup(.notifications): NotificationsStep()
                    case .main: EmptyView()
                    }
                }
                .id(step)
                .transition(reduceMotion ? .opacity : .asymmetric(
                    insertion: .offset(x: 24).combined(with: .opacity),
                    removal: .offset(x: -24).combined(with: .opacity)))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.horizontal, 32)
                .padding(.bottom, 32)
            }
        }
        .animation(Motion.spring(reduceMotion), value: step)
    }
}

/// Soft, slowly drifting tints (accent, teal, amber) on the canvas. Static with Reduce Motion.
struct OnboardingBackdrop: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme
    @Environment(\.meldAccent) private var accent

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 20, paused: reduceMotion)) { ctx in
            let t = reduceMotion ? 0 : ctx.date.timeIntervalSinceReferenceDate
            let strength = scheme == .dark ? 0.16 : 0.22
            GeometryReader { geo in
                let w = geo.size.width, h = geo.size.height
                ZStack {
                    Palette.canvas
                    blob(accent, strength, w * 0.55)
                        .position(x: w * (0.22 + 0.04 * sin(t * 0.21)), y: h * (0.28 + 0.05 * cos(t * 0.17)))
                    blob(Color(hex: 0x14B8A6), strength * 0.8, w * 0.45)
                        .position(x: w * (0.82 + 0.04 * cos(t * 0.19)), y: h * (0.32 + 0.05 * sin(t * 0.23)))
                    blob(Color(hex: 0xF5A524), strength * 0.7, w * 0.5)
                        .position(x: w * (0.6 + 0.05 * sin(t * 0.15)), y: h * (0.92 + 0.03 * cos(t * 0.2)))
                }
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }

    private func blob(_ color: Color, _ opacity: Double, _ size: CGFloat) -> some View {
        Circle()
            .fill(RadialGradient(colors: [color.opacity(opacity), color.opacity(0)], center: .center, startRadius: 0, endRadius: size / 2))
            .frame(width: size, height: size)
    }
}

private struct StepDots: View {
    let current: Int
    let total: Int

    var body: some View {
        HStack(spacing: 6) {
            ForEach(1...total, id: \.self) { i in
                Capsule()
                    .fill(i == current ? AnyShapeStyle(.tint) : AnyShapeStyle(Palette.input))
                    .frame(width: i == current ? 18 : 6, height: 6)
            }
        }
        .animation(.spring(duration: 0.3), value: current)
        .accessibilityElement()
        .accessibilityLabel("Step \(current) of \(total)")
    }
}

/// Title + one-line explainer, shared by every step.
struct StepHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 8) {
            Text(title)
                .font(.system(size: 28, weight: .semibold))
                .tracking(-0.5)
                .foregroundStyle(Palette.ink)
                .multilineTextAlignment(.center)
            Text(subtitle)
                .font(.system(size: 14))
                .foregroundStyle(Palette.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// The floating card each step's controls sit on: card surface, hairline, small shadow.
struct OnboardingCard<Content: View>: View {
    var width: CGFloat = 400
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 14) { content }
            .padding(24)
            .frame(width: width)
            .background(Palette.card, in: .rect(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Palette.border, lineWidth: 1))
            .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
    }
}

/// Error line in the destructive colors.
struct ErrorNote: View {
    let message: String

    var body: some View {
        Label(message, systemImage: "exclamationmark.circle")
            .font(.meldMeta)
            .foregroundStyle(Palette.destructive)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(Palette.dangerSoft, in: .rect(cornerRadius: 6))
            .transition(.opacity)
    }
}

// MARK: - 1. Welcome

/// The four named agents, with the soft tint behind each face.
let namedAgents: [(name: String, role: String, tint: Color)] = [
    ("Atlas", "Lead", Color(hex: 0x2952E3)),
    ("Tess", "Triage", Color(hex: 0x14B8A6)),
    ("Rex", "Reviews", Color(hex: 0xF5A524)),
    ("Sunny", "Standups", Color(hex: 0xEF6F6C)),
]

struct WelcomeStep: View {
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var notch: CGFloat = 0
    @State private var markShown = false
    @State private var textShown = false
    @State private var facesShown = 0
    @State private var buttonsShown = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 8)
            MeldMark(notch: notch)
                .fill(Color.meldBlue)
                .frame(width: 76, height: 76)
                .scaleEffect(markShown ? 1 : 0.6)
                .opacity(markShown ? 1 : 0)
                .accessibilityLabel("Meld")

            VStack(spacing: 10) {
                Text("Slack is where work gets talked about.\nMeld is where it gets done.")
                    .font(.system(size: 30, weight: .semibold))
                    .tracking(-0.6)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Team chat and tickets in one place, with agents as teammates who turn conversation into owned work.")
                    .font(.system(size: 15))
                    .foregroundStyle(Palette.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 480)
            }
            .padding(.top, 26)
            .opacity(textShown ? 1 : 0)
            .offset(y: textShown ? 0 : 6)

            HStack(spacing: 22) {
                ForEach(Array(namedAgents.enumerated()), id: \.offset) { i, a in
                    VStack(spacing: 8) {
                        ZStack {
                            Circle().fill(a.tint.opacity(0.16))
                            AgentFace(name: a.name, size: 58)
                        }
                        .frame(width: 72, height: 72)
                        VStack(spacing: 1) {
                            Text(a.name).font(.meldName).foregroundStyle(Palette.ink)
                            Text(a.role).font(.meldCaption).foregroundStyle(Palette.muted)
                        }
                    }
                    .opacity(facesShown > i ? 1 : 0)
                    .offset(y: facesShown > i ? 0 : 14)
                }
            }
            .padding(.top, 30)

            VStack(spacing: 10) {
                Button("Get started") { model.getStarted() }
                    .buttonStyle(MeldPrimaryButtonStyle(height: 40))
                    .keyboardShortcut(.defaultAction)
                Button {
                    model.tryDemo()
                } label: {
                    if model.signIn == .startingDemo {
                        Text("Setting up your demo company…")
                    } else {
                        Text("Try the demo")
                    }
                }
                .buttonStyle(MeldSecondaryButtonStyle(height: 40))
                .disabled(model.signIn == .startingDemo)
                if model.signIn == .startingDemo { WorkingBar().frame(width: 160) }
                if let e = model.errorMessage { ErrorNote(message: e) }
            }
            .frame(width: 280)
            .padding(.top, 32)
            .opacity(buttonsShown ? 1 : 0)
            Spacer(minLength: 8)
        }
        .task { await animateIn() }
    }

    private func animateIn() async {
        if reduceMotion {
            notch = 1; markShown = true; textShown = true; facesShown = 4; buttonsShown = true
            return
        }
        withAnimation(.spring(duration: 0.35, bounce: 0.3)) { markShown = true }
        try? await Task.sleep(for: .milliseconds(250))
        withAnimation(.spring(duration: 0.35)) { notch = 1 }
        try? await Task.sleep(for: .milliseconds(200))
        withAnimation(.easeOut(duration: 0.3)) { textShown = true }
        for i in 1...4 {
            try? await Task.sleep(for: .milliseconds(110))
            withAnimation(.spring(duration: 0.32, bounce: 0.25)) { facesShown = i }
        }
        withAnimation(.easeOut(duration: 0.25)) { buttonsShown = true }
    }
}
