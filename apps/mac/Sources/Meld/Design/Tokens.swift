import AppKit
import SwiftUI

/// Meld's design tokens (docs/DESIGN_SYSTEM.md §4, from src/app/globals.css), light and dark.
/// Used *inside* content (messages, rows, pills, chips, avatars, cards). Window chrome,
/// sidebar and toolbar use the system's own materials instead.
enum Palette {
    // Surfaces and text
    static let background = Color(light: 0xFFFFFF, dark: 0x141518)
    static let canvas = Color(light: 0xF7F8F9, dark: 0x101114)
    static let card = Color(light: 0xFFFFFF, dark: 0x18191D)
    static let popover = Color(light: 0xFFFFFF, dark: 0x1D1F23)
    static let ink = Color(light: 0x17191C, dark: 0xE7E9EC)
    static let ink2 = Color(light: 0x363B44, dark: 0xC6CAD1)
    static let muted = Color(light: 0x5C6370, dark: 0x9AA0AA)
    static let subtle = Color(light: 0x8B919C, dark: 0x6E747E)
    static let border = Color(light: 0xE2E4E8, dark: 0x2A2D33)
    static let lineSoft = Color(light: 0xEEF0F2, dark: 0x212328)
    static let input = Color(light: 0xCDD1D7, dark: 0x3A3E45)
    static let quietFill = Color(light: 0xF5F6F7, dark: 0x1C1E22)
    static let hoverFill = Color(light: 0xECEEF1, dark: 0x26292E)

    // Brand family
    static let link = Color(light: 0x2148B8, dark: 0x8EAAF5)
    static let mentionBg = Color(light: 0xEAF0FC, dark: 0x1D2740)
    static let mentionFg = Color(light: 0x1F45AD, dark: 0xA9BDF5)
    static let selected = Color(light: 0xEEF3FD, dark: 0x1B2236)

    // Agents: neutral by design
    static let agentBg = Color(light: 0xEEF0F2, dark: 0x25282D)
    static let agentFg = Color(light: 0x474D57, dark: 0xB9BEC7)
    static let agentBorder = Color(light: 0xD5D8DD, dark: 0x383C43)

    // Semantic
    static let success = Color(light: 0x17724C, dark: 0x5CC795)
    static let successSoft = Color(light: 0xEAF5EF, dark: 0x142A20)
    static let warning = Color(light: 0x8F5207, dark: 0xE0A84F)
    static let warningSoft = Color(light: 0xFBF3E4, dark: 0x2C2314)
    static let destructive = Color(light: 0xB3261E, dark: 0xF2766B)
    static let dangerSoft = Color(light: 0xFCECEA, dark: 0x2E1816)
    static let unread = Color(hex: 0xC8321F)
    static let online = Color(hex: 0x1F9D63)

    /// Ticket status: background, text, border, dot.
    static func status(_ s: TicketStatus) -> (bg: Color, fg: Color, line: Color, dot: Color) {
        switch s {
        case .todo: (Color(light: 0xF0F1F3, dark: 0x25282D), Color(light: 0x3F4550, dark: 0xC6CAD1), Color(light: 0xD3D6DB, dark: 0x3A3E45), Color(hex: 0x8B919C))
        case .inProgress: (Color(light: 0xEBF1FC, dark: 0x1B2440), Color(light: 0x1F45AD, dark: 0xA9BDF5), Color(light: 0xBFD0F3, dark: 0x2F4178), Color(light: 0x3866D6, dark: 0x6489EB))
        case .inReview: (Color(light: 0xFBF3E4, dark: 0x2C2314), Color(light: 0x85500C, dark: 0xE0A84F), Color(light: 0xECD3A3, dark: 0x5A4420), Color(light: 0xC9871A, dark: 0xD8962E))
        case .done: (Color(light: 0xE9F4EE, dark: 0x142A20), Color(light: 0x17724C, dark: 0x5CC795), Color(light: 0xB5DCC6, dark: 0x24533D), Color(light: 0x2B9A64, dark: 0x3CB07A))
        case .backburner: (Color(light: 0xF5F6F7, dark: 0x1C1E22), Color(light: 0x5C6370, dark: 0x9AA0AA), Color(light: 0xD3D6DB, dark: 0x3A3E45), Color(light: 0xB0B5BD, dark: 0x6E747E))
        }
    }

    static func priority(_ p: Priority) -> Color {
        switch p {
        case .high: destructive
        case .medium: warning
        case .low: muted
        }
    }
}

/// Workspace accents (src/lib/constants.ts). All pass 4.5:1 with white text.
enum Accent: String, CaseIterable, Identifiable {
    case cobalt = "#2952E3", teal = "#0F766E", graphite = "#374154", orange = "#C2410C"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .cobalt: "Cobalt"
        case .teal: "Teal"
        case .graphite: "Graphite"
        case .orange: "Orange"
        }
    }
    var color: Color { Color(hex: UInt32(rawValue.dropFirst(), radix: 16) ?? 0x2952E3) }
}

extension EnvironmentValues {
    /// The workspace accent as a Color, for places that need one (gradients, tints with
    /// opacity). Elsewhere use the `.tint` shape style, which follows the same accent.
    @Entry var meldAccent: Color = .meldBlue
}

/// Type scale (§5), on the system font.
extension Font {
    static let meldTiny = Font.system(size: 11, weight: .medium)
    static let meldCaption = Font.system(size: 12)
    static let meldMeta = Font.system(size: 13)
    static let meldBody = Font.system(size: 14)
    static let meldName = Font.system(size: 14, weight: .semibold)
    static let meldTitle = Font.system(size: 15, weight: .semibold)
    static let meldDialogTitle = Font.system(size: 18, weight: .semibold)
}

/// Motion (§7): short, spring-like, and instant when Reduce Motion is on.
enum Motion {
    static let press = Animation.timingCurve(0.2, 0, 0, 1, duration: 0.12)
    static let arrive = Animation.easeOut(duration: 0.18)
    static func spring(_ reduce: Bool) -> Animation? { reduce ? nil : .spring(duration: 0.3, bounce: 0.15) }
}

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }

    /// A color that follows the window's light or dark appearance.
    init(light: UInt32, dark: UInt32) {
        self.init(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            let hex = isDark ? dark : light
            return NSColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                           blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
        })
    }

    init?(cssHex: String) {
        let s = cssHex.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "#", with: "")
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self.init(hex: v)
    }
}
