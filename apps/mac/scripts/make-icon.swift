// Renders the Meld app icon (white mark on a blue gradient squircle) into an .iconset.
// Usage: swift scripts/make-icon.swift <out.iconset>
import AppKit

let out = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "Meld.iconset")
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

func render(_ px: Int) -> Data {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    let ctx = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.current = ctx
    let cg = ctx.cgContext
    let s = CGFloat(px) / 1024

    // macOS icon grid: 824pt squircle centered on a 1024 canvas.
    let body = CGRect(x: 100 * s, y: 100 * s, width: 824 * s, height: 824 * s)
    let shape = NSBezierPath(roundedRect: body, xRadius: 185 * s, yRadius: 185 * s)

    cg.saveGState()
    cg.setShadow(offset: CGSize(width: 0, height: -12 * s), blur: 28 * s, color: NSColor.black.withAlphaComponent(0.28).cgColor)
    NSColor(red: 0.16, green: 0.32, blue: 0.89, alpha: 1).setFill()
    shape.fill()
    cg.restoreGState()

    shape.addClip()
    let gradient = NSGradient(colors: [
        NSColor(red: 0.23, green: 0.39, blue: 0.93, alpha: 1),
        NSColor(red: 0.16, green: 0.32, blue: 0.89, alpha: 1),
    ])!
    gradient.draw(in: body, angle: -90)
    // Soft top highlight, like glass.
    NSGradient(colors: [NSColor.white.withAlphaComponent(0.12), NSColor.white.withAlphaComponent(0)])!
        .draw(in: CGRect(x: body.minX, y: body.midY, width: body.width, height: body.height / 2), angle: -90)

    // The mark, on the web logo's 32 grid (y flipped for AppKit).
    let markSize = 520 * s
    let ox = body.midX - markSize / 2, oy = body.midY - markSize / 2 - 10 * s
    let u = markSize / 32
    func p(_ x: CGFloat, _ y: CGFloat) -> NSPoint { NSPoint(x: ox + x * u, y: oy + (32 - y) * u) }
    let k: CGFloat = 0.5523
    let m = NSBezierPath()
    m.move(to: p(8, 3)); m.line(to: p(24, 3))
    m.curve(to: p(30, 9), controlPoint1: p(24 + 6 * k, 3), controlPoint2: p(30, 9 - 6 * k))
    m.line(to: p(30, 11))
    m.curve(to: p(27, 14), controlPoint1: p(30 - 3 * k, 11), controlPoint2: p(27, 14 - 3 * k))
    m.curve(to: p(30, 17), controlPoint1: p(27, 14 + 3 * k), controlPoint2: p(30 - 3 * k, 17))
    m.line(to: p(30, 19))
    m.curve(to: p(24, 25), controlPoint1: p(30, 19 + 6 * k), controlPoint2: p(24 + 6 * k, 25))
    m.line(to: p(10, 25)); m.line(to: p(2, 30)); m.line(to: p(2, 17))
    m.curve(to: p(5, 14), controlPoint1: p(2 + 3 * k, 17), controlPoint2: p(5, 14 + 3 * k))
    m.curve(to: p(2, 11), controlPoint1: p(5, 14 - 3 * k), controlPoint2: p(2 + 3 * k, 11))
    m.line(to: p(2, 9))
    m.curve(to: p(8, 3), controlPoint1: p(2, 9 - 6 * k), controlPoint2: p(8 - 6 * k, 3))
    m.close()
    cg.setShadow(offset: CGSize(width: 0, height: -8 * s), blur: 24 * s, color: NSColor.black.withAlphaComponent(0.2).cgColor)
    NSColor.white.setFill()
    m.fill()

    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

for size in [16, 32, 128, 256, 512] {
    try! render(size).write(to: out.appendingPathComponent("icon_\(size)x\(size).png"))
    try! render(size * 2).write(to: out.appendingPathComponent("icon_\(size)x\(size)@2x.png"))
}
print("wrote \(out.path)")
