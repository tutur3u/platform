import Foundation
#if canImport(SwiftUI)
import SwiftUI
#endif

public struct SorbetRGB: Sendable, Equatable {
  public let r: Double
  public let g: Double
  public let b: Double

  public init(hex: UInt32) {
    self.r = Double((hex >> 16) & 0xFF) / 255.0
    self.g = Double((hex >> 8) & 0xFF) / 255.0
    self.b = Double(hex & 0xFF) / 255.0
  }

  #if canImport(SwiftUI)
  public var color: Color {
    Color(.sRGB, red: r, green: g, blue: b, opacity: 1.0)
  }
  #endif
}

public struct SorbetWatchHue: Sendable, Equatable {
  public let fill: SorbetRGB
  public let calm: SorbetRGB
  public let ink: SorbetRGB

  public func activeFill(calmColors: Bool) -> SorbetRGB {
    calmColors ? calm : fill
  }
}

/// Dark Sorbet tokens mirroring `apps/mobile/lib/core/theme/sorbet/sorbet_palettes.dart`
/// (`_darkRoles` and `_darkHues`) adapted for watchOS OLED surfaces.
public enum SorbetWatchPalette {
  public static let ground = SorbetRGB(hex: 0x1D1A22)
  public static let background = SorbetRGB(hex: 0x18151C)
  public static let surface = SorbetRGB(hex: 0x211D26)
  public static let surfaceSunken = SorbetRGB(hex: 0x2A2530)
  public static let accent = SorbetRGB(hex: 0x2F2935)
  public static let border = SorbetRGB(hex: 0x3A3241)
  public static let foreground = SorbetRGB(hex: 0xF6EFF4)
  public static let mutedForeground = SorbetRGB(hex: 0xB3A8B5)
  public static let primary = SorbetRGB(hex: 0xF6EFF4)
  public static let primaryForeground = SorbetRGB(hex: 0x18151C)

  public static let blue = SorbetWatchHue(
    fill: SorbetRGB(hex: 0x22396B),
    calm: SorbetRGB(hex: 0x22304F),
    ink: SorbetRGB(hex: 0xB5CDFF)
  )
  public static let green = SorbetWatchHue(
    fill: SorbetRGB(hex: 0x1E4A24),
    calm: SorbetRGB(hex: 0x1F3A22),
    ink: SorbetRGB(hex: 0xAEE6A4)
  )
  public static let orange = SorbetWatchHue(
    fill: SorbetRGB(hex: 0x55321A),
    calm: SorbetRGB(hex: 0x3F2A17),
    ink: SorbetRGB(hex: 0xFFC996)
  )
  public static let red = SorbetWatchHue(
    fill: SorbetRGB(hex: 0x5C2525),
    calm: SorbetRGB(hex: 0x432121),
    ink: SorbetRGB(hex: 0xFFB3AE)
  )
  public static let yellow = SorbetWatchHue(
    fill: SorbetRGB(hex: 0x4A3C10),
    calm: SorbetRGB(hex: 0x3A3115),
    ink: SorbetRGB(hex: 0xF5D97A)
  )
  public static let purple = SorbetWatchHue(
    fill: SorbetRGB(hex: 0x3A2861),
    calm: SorbetRGB(hex: 0x2F2347),
    ink: SorbetRGB(hex: 0xD3BCFF)
  )
  public static let pink = SorbetWatchHue(
    fill: SorbetRGB(hex: 0x592341),
    calm: SorbetRGB(hex: 0x422033),
    ink: SorbetRGB(hex: 0xFFB4D6)
  )
  public static let teal = SorbetWatchHue(
    fill: SorbetRGB(hex: 0x13443C),
    calm: SorbetRGB(hex: 0x17332F),
    ink: SorbetRGB(hex: 0x93E0D5)
  )
  public static let gray = SorbetWatchHue(
    fill: SorbetRGB(hex: 0x342E38),
    calm: SorbetRGB(hex: 0x2C2830),
    ink: SorbetRGB(hex: 0xC9C0CA)
  )

  public static func hue(for priority: WatchTaskPriority) -> SorbetWatchHue {
    switch priority {
    case .critical: return red
    case .high: return orange
    case .normal: return blue
    case .low: return teal
    case .none: return gray
    }
  }

  public static func hue(forCalendarColor rawColor: String?) -> SorbetWatchHue {
    switch rawColor?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
    case "green": return green
    case "orange": return orange
    case "red": return red
    case "yellow": return yellow
    case "purple", "indigo": return purple
    case "pink": return pink
    case "cyan", "teal": return teal
    case "gray": return gray
    default: return blue
    }
  }

  public static let cardCornerRadius: Double = 16
  public static let rowCornerRadius: Double = 12
}
