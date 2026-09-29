// Draws longroadsoftware.com's images: the social preview (images/og-image.png, 1200 × 630) and the logo
// (images/logo.png, 512 × 512, the favicon's road-sign mark).
//
//   swift tools/make_images.swift <site root>
//
// The look is a US guide sign: highway green, a white inset border, white lettering in DIN (the road-sign face
// macOS ships), and a yellow centre line.
import AppKit

let green = NSColor(srgbRed: 0x0f / 255, green: 0x6b / 255, blue: 0x45 / 255, alpha: 1)
let yellow = NSColor(srgbRed: 0xf2 / 255, green: 0xb7 / 255, blue: 0x05 / 255, alpha: 1)
let asphalt = NSColor(srgbRed: 0x15 / 255, green: 0x20 / 255, blue: 0x1b / 255, alpha: 1)

func canvas(_ w: Int, _ h: Int, _ draw: (CGContext) -> Void) -> Data {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                               bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    let context = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.current = context
    let cg = context.cgContext
    cg.translateBy(x: 0, y: CGFloat(h)); cg.scaleBy(x: 1, y: -1)          // y down, as on a page
    draw(cg)
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

func font(_ name: String, _ size: CGFloat) -> NSFont {
    NSFont(name: name, size: size) ?? NSFont.systemFont(ofSize: size, weight: .bold)
}

/// Text drawn with its top-left at `origin`, in the flipped (y-down) context.
func text(_ s: String, _ f: NSFont, _ color: NSColor, at origin: CGPoint, kern: CGFloat = 0) {
    let attributed = NSAttributedString(string: s, attributes: [.font: f, .foregroundColor: color, .kern: kern])
    NSGraphicsContext.current?.saveGraphicsState()
    let flip = NSAffineTransform(); flip.translateX(by: origin.x, yBy: origin.y + f.ascender); flip.scaleX(by: 1, yBy: -1); flip.concat()
    attributed.draw(at: .zero)
    NSGraphicsContext.current?.restoreGraphicsState()
}

/// The road: two white edges meeting toward the horizon, and a dashed yellow centre line.
func road(_ cg: CGContext, in r: CGRect, edge: CGFloat, dash: CGFloat) {
    cg.setLineCap(.round)
    cg.setStrokeColor(NSColor.white.cgColor); cg.setLineWidth(edge)
    // At the horizon the edges stay apart by more than their own width, so they never touch.
    let gap = max(r.width * 0.08, edge * 1.6)
    cg.move(to: CGPoint(x: r.minX, y: r.maxY)); cg.addLine(to: CGPoint(x: r.midX - gap, y: r.minY))
    cg.move(to: CGPoint(x: r.maxX, y: r.maxY)); cg.addLine(to: CGPoint(x: r.midX + gap, y: r.minY))
    cg.strokePath()
    // Dashes shorten and thin toward the horizon, and stop short of it.
    cg.setStrokeColor(yellow.cgColor)
    let steps: [(CGFloat, CGFloat, CGFloat)] = [(0.96, 0.78, 1.0), (0.64, 0.50, 0.8), (0.39, 0.29, 0.62), (0.21, 0.15, 0.46)]
    for (a, b, w) in steps {
        cg.setLineWidth(dash * w)
        cg.move(to: CGPoint(x: r.midX, y: r.minY + r.height * a)); cg.addLine(to: CGPoint(x: r.midX, y: r.minY + r.height * b))
        cg.strokePath()
    }
}

func signPlate(_ cg: CGContext, _ r: CGRect, radius: CGFloat, border: CGFloat) {
    cg.setFillColor(green.cgColor)
    cg.addPath(CGPath(roundedRect: r, cornerWidth: radius, cornerHeight: radius, transform: nil)); cg.fillPath()
    let inner = r.insetBy(dx: border * 2, dy: border * 2)
    cg.setStrokeColor(NSColor.white.cgColor); cg.setLineWidth(border)
    cg.addPath(CGPath(roundedRect: inner, cornerWidth: radius * 0.7, cornerHeight: radius * 0.7, transform: nil)); cg.strokePath()
}

let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".")
let images = root.appendingPathComponent("images")
try? FileManager.default.createDirectory(at: images, withIntermediateDirectories: true)

// Social preview, 1200 × 630: an asphalt ground, the sign on the left third, the road running into it.
let og = canvas(1200, 630) { cg in
    cg.setFillColor(asphalt.cgColor); cg.fill(CGRect(x: 0, y: 0, width: 1200, height: 630))
    signPlate(cg, CGRect(x: 72, y: 96, width: 1056, height: 330), radius: 34, border: 7)
    road(cg, in: CGRect(x: 120, y: 150, width: 200, height: 220), edge: 12, dash: 11)
    text("LONG ROAD", font("DINAlternate-Bold", 118), .white, at: CGPoint(x: 372, y: 142), kern: 2)
    text("SOFTWARE", font("DINAlternate-Bold", 64), .white, at: CGPoint(x: 376, y: 276), kern: 14)
    text("Makers of MediaFlowSwift, footage management for Mac video creators",
         font("AvenirNext-Medium", 30), NSColor(white: 1, alpha: 0.86), at: CGPoint(x: 72, y: 470))
    text("longroadsoftware.com", font("DINAlternate-Bold", 30), yellow, at: CGPoint(x: 72, y: 530), kern: 1)
}
try og.write(to: images.appendingPathComponent("og-image.png"))

// Logo, 512 × 512: the favicon's mark.
let logo = canvas(512, 512) { cg in
    signPlate(cg, CGRect(x: 16, y: 16, width: 480, height: 480), radius: 80, border: 18)
    road(cg, in: CGRect(x: 136, y: 136, width: 240, height: 290), edge: 28, dash: 26)
}
try logo.write(to: images.appendingPathComponent("logo.png"))
print("wrote images/og-image.png and images/logo.png")
