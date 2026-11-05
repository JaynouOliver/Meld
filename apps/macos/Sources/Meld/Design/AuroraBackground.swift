import SwiftUI

/// A slow-moving, colorful mesh gradient: the canvas behind onboarding.
/// `palette` lets each welcome page tint it differently; changes animate.
struct AuroraBackground: View {
    var palette: [Color]

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            MeshGradient(
                width: 3, height: 3,
                points: [
                    [0, 0], [0.5, 0], [1, 0],
                    [0, 0.5], [Float(0.5 + 0.18 * sin(t * 0.35)), Float(0.5 + 0.14 * cos(t * 0.28))], [1, 0.5],
                    [0, 1], [Float(0.5 + 0.12 * cos(t * 0.22)), 1], [1, 1],
                ],
                colors: colors
            )
        }
        .ignoresSafeArea()
        .animation(.smooth(duration: 0.9), value: palette)
    }

    private var colors: [Color] {
        let p = palette.isEmpty ? [.meldBlue] : palette
        return (0..<9).map { p[$0 % p.count] }
    }
}

/// A pill-shaped glass chip, used for small labels on onboarding.
struct GlassChip: View {
    let systemImage: String
    let text: String

    var body: some View {
        Label(text, systemImage: systemImage)
            .font(.callout.weight(.medium))
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .glassEffect(.regular, in: .capsule)
    }
}
