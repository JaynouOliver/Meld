import AppKit
import SwiftUI

extension Color {
    /// Meld blue (#2952E3), the same as MELD_BLUE on the web.
    static let meldBlue = Color(red: 0x29 / 255, green: 0x52 / 255, blue: 0xE3 / 255)
    static let meldIndigo = Color(red: 0x5B / 255, green: 0x3D / 255, blue: 0xF5 / 255)
    static let meldViolet = Color(red: 0x9B / 255, green: 0x4D / 255, blue: 0xF0 / 255)
    static let meldPink = Color(red: 0xF0 / 255, green: 0x4E / 255, blue: 0x98 / 255)
    static let meldTeal = Color(red: 0x14 / 255, green: 0xB8 / 255, blue: 0xA6 / 255)
    static let meldAmber = Color(red: 0xF5 / 255, green: 0x9E / 255, blue: 0x0B / 255)
}

/// The Meld mark: a speech bubble with a ticket's notched edges. Same geometry as
/// MARK_PATH in src/components/marketing/logo.tsx, on its 32×32 grid.
struct MeldMark: Shape {
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 32
        let ox = rect.midX - 16 * s, oy = rect.midY - 16 * s
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: ox + x * s, y: oy + y * s) }
        let k: CGFloat = 0.5523 // cubic approximation of a quarter circle

        var path = Path()
        path.move(to: p(8, 3))
        path.addLine(to: p(24, 3))
        path.addCurve(to: p(30, 9), control1: p(24 + 6 * k, 3), control2: p(30, 9 - 6 * k))
        path.addLine(to: p(30, 11))
        // Right notch (bites inward).
        path.addCurve(to: p(27, 14), control1: p(30 - 3 * k, 11), control2: p(27, 14 - 3 * k))
        path.addCurve(to: p(30, 17), control1: p(27, 14 + 3 * k), control2: p(30 - 3 * k, 17))
        path.addLine(to: p(30, 19))
        path.addCurve(to: p(24, 25), control1: p(30, 19 + 6 * k), control2: p(24 + 6 * k, 25))
        path.addLine(to: p(10, 25))
        path.addLine(to: p(2, 30))
        path.addLine(to: p(2, 17))
        // Left notch.
        path.addCurve(to: p(5, 14), control1: p(2 + 3 * k, 17), control2: p(5, 14 + 3 * k))
        path.addCurve(to: p(2, 11), control1: p(5, 14 - 3 * k), control2: p(2 + 3 * k, 11))
        path.addLine(to: p(2, 9))
        path.addCurve(to: p(8, 3), control1: p(2, 9 - 6 * k), control2: p(8 - 6 * k, 3))
        path.closeSubpath()
        return path
    }
}

/// The app icon look: white mark on a blue squircle with a soft gradient.
struct MeldAppIcon: View {
    var size: CGFloat = 64

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.225, style: .continuous)
            .fill(LinearGradient(colors: [Color(red: 0.25, green: 0.42, blue: 0.98), .meldBlue, .meldIndigo],
                                 startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay {
                MeldMark().fill(.white).padding(size * 0.2)
            }
            .overlay {
                RoundedRectangle(cornerRadius: size * 0.225, style: .continuous)
                    .strokeBorder(.white.opacity(0.25), lineWidth: max(1, size / 96))
            }
            .frame(width: size, height: size)
            .shadow(color: .meldBlue.opacity(0.35), radius: size * 0.18, y: size * 0.08)
    }
}

/// Provider logos, from the same SVGs the web app uses.
enum BrandLogo {
    static let google = image(from: """
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48">
    <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81Z"/>
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.92l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A12 12 0 0 0 12 24Z"/>
    <path fill="#FBBC05" d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.29a12 12 0 0 0 0 10.76l4-3.1Z"/>
    <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.43-3.43A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.29 6.62l4 3.1C6.23 6.88 8.88 4.77 12 4.77Z"/>
    </svg>
    """, template: false)

    static let github = image(from: """
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48">
    <path fill="#000" d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/>
    </svg>
    """, template: true)

    private static func image(from svg: String, template: Bool) -> NSImage {
        let img = NSImage(data: Data(svg.utf8)) ?? NSImage()
        img.isTemplate = template
        return img
    }
}
