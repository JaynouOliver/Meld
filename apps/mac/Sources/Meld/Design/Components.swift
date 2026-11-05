import SwiftUI

/// "Agent", after an agent's name: small, monochrome, neutral.
struct AgentTag: View {
    var body: some View {
        Text("Agent")
            .font(.system(size: 10, weight: .medium))
            .foregroundStyle(Palette.agentFg)
            .padding(.horizontal, 4)
            .padding(.vertical, 1)
            .background(Palette.agentBg, in: .rect(cornerRadius: 3))
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(Palette.agentBorder, lineWidth: 1))
    }
}

/// Primary: accent fill, white text, 6pt radius. Dips to 0.97 when pressed.
struct MeldPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    var height: CGFloat = 36

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .frame(height: height)
            .frame(maxWidth: .infinity)
            .background(.tint, in: .rect(cornerRadius: 6))
            .opacity(enabled ? (configuration.isPressed ? 0.9 : 1) : 0.5)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(Motion.press, value: configuration.isPressed)
            .contentShape(.rect)
    }
}

/// Secondary: background fill, input border, ink text.
struct MeldSecondaryButtonStyle: ButtonStyle {
    var height: CGFloat = 36
    var fill = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Palette.ink)
            .padding(.horizontal, 16)
            .frame(height: height)
            .frame(maxWidth: fill ? .infinity : nil)
            .background(configuration.isPressed ? Palette.hoverFill : Palette.background, in: .rect(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Palette.input, lineWidth: 1))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(Motion.press, value: configuration.isPressed)
            .contentShape(.rect)
    }
}

/// Ghost: no border, hover fill.
struct MeldGhostButtonStyle: ButtonStyle {
    @State private var hovering = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .padding(.horizontal, 8)
            .frame(height: 28)
            .background(hovering || configuration.isPressed ? Palette.hoverFill : .clear, in: .rect(cornerRadius: 6))
            .onHover { hovering = $0 }
            .contentShape(.rect)
    }
}

/// Skeleton block that pulses between 100% and 55% every 1.4s (static with Reduce Motion).
struct Skeleton: View {
    var width: CGFloat? = nil
    var height: CGFloat = 12
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dim = false

    var body: some View {
        RoundedRectangle(cornerRadius: 4)
            .fill(Palette.quietFill)
            .frame(width: width, height: height)
            .opacity(dim ? 0.55 : 1)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true)) { dim = true }
            }
    }
}

/// Thin indeterminate bar in the accent color, for "an agent is working".
struct WorkingBar: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase: CGFloat = -0.4

    var body: some View {
        GeometryReader { geo in
            Rectangle()
                .fill(.tint)
                .frame(width: geo.size.width * 0.35)
                .offset(x: reduceMotion ? 0 : geo.size.width * phase)
        }
        .frame(height: 2)
        .clipped()
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) { phase = 1 }
        }
    }
}

/// Content arriving: fade in plus a 2pt rise over 180ms.
struct Arrive: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown || reduceMotion ? 1 : 0)
            .offset(y: shown || reduceMotion ? 0 : 2)
            .onAppear { withAnimation(Motion.arrive) { shown = true } }
    }
}

extension View {
    func arrive() -> some View { modifier(Arrive()) }
}
