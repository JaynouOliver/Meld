import AppKit
import SwiftUI

/// Avatar (src/components/common/avatar.tsx): an illustrated face over the person's
/// identity color, initials until the image loads. People are rounded squares (6pt radius,
/// 12 at 64pt); agents are always circles. That's how humans and agents are told apart.
struct Avatar: View {
    let person: Person?
    var size: CGFloat = 32
    var presence = false

    @State private var image: NSImage?

    var body: some View {
        let isAgent = person?.agent ?? false
        let shape = isAgent ? AnyShape(Circle()) : AnyShape(RoundedRectangle(cornerRadius: size >= 64 ? 12 : 6, style: .continuous))
        ZStack {
            if let image {
                Palette.quietFill
                Image(nsImage: image).resizable().scaledToFill()
            } else {
                Color(cssHex: person?.color ?? "") ?? Palette.subtle
                Text(person?.initials ?? "?")
                    .font(.system(size: size * 0.36, weight: .semibold))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .clipShape(shape)
        .overlay(alignment: .bottomTrailing) {
            if presence {
                Circle().fill(Palette.online)
                    .frame(width: size * 0.3, height: size * 0.3)
                    .overlay(Circle().stroke(Palette.background, lineWidth: 2))
                    .offset(x: 2, y: 2)
            }
        }
        .accessibilityLabel(person?.name ?? "")
        .task(id: person?.id) { image = await AvatarImages.shared.image(for: person) }
    }
}

/// Loads and caches faces: bundled agent characters, then the person's photo or their
/// stable illustrated face from the site (/avatars/person-N.svg).
@MainActor
final class AvatarImages {
    static let shared = AvatarImages()
    private var cache: [String: NSImage] = [:]

    func image(for p: Person?) async -> NSImage? {
        guard let p, let src = Self.source(for: p) else { return nil }
        if let hit = cache[src] { return hit }
        let image: NSImage?
        if src.hasPrefix("bundle:") {
            image = Self.bundled(String(src.dropFirst(7)))
        } else if let url = URL(string: src, relativeTo: Config.webURL)?.absoluteURL,
                  let (data, _) = try? await URLSession.shared.data(from: url) {
            image = NSImage(data: data)
        } else {
            image = nil
        }
        if let image { cache[src] = image }
        return image
    }

    /// Same choice as avatarSrc() on the web.
    static func source(for p: Person) -> String? {
        if let url = p.avatarUrl, !url.isEmpty { return url }
        if p.id == "atlas" { return "bundle:agent-atlas" }
        if p.agent {
            let key = p.name.trimmingCharacters(in: .whitespaces).lowercased()
            return ["atlas", "tess", "rex", "sunny"].contains(key) ? "bundle:agent-\(key)" : "/avatars/agent-\(hash(p.id) % 8).svg"
        }
        return "/avatars/person-\(hash(p.id) % 24).svg"
    }

    /// The four named agents ship inside the app, so onboarding shows them offline.
    static func bundled(_ name: String) -> NSImage? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "svg", subdirectory: "Avatars")
            ?? URL(string: "/avatars/\(name).svg", relativeTo: Config.webURL) else { return nil }
        if url.isFileURL { return NSImage(contentsOf: url) }
        return nil
    }

    /// `h = (h * 31 + charCode) >>> 0` over the id, as in avatar.tsx.
    static func hash(_ s: String) -> Int {
        var h: UInt32 = 0
        for ch in s { h = h &* 31 &+ UInt32(ch.utf16.first ?? 0) }
        return Int(h)
    }
}

/// A face for one of the four named agents, for onboarding (no workspace needed).
struct AgentFace: View {
    let name: String
    var size: CGFloat = 64

    var body: some View {
        Group {
            if let img = AvatarImages.bundled("agent-\(name.lowercased())") {
                Image(nsImage: img).resizable().scaledToFit()
            } else {
                Text(String(name.prefix(1))).font(.system(size: size * 0.4, weight: .semibold))
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityLabel(name)
    }
}
