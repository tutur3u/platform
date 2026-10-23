import 'dart:math' as math;
import 'dart:ui';

/// WCAG 2.x helpers used to keep curated appearance colours accessible.
abstract final class AppearanceContrast {
  static const aaText = 4.5;
  static const aaNonText = 3.0;

  static double relativeLuminance(Color color) {
    double channel(double value) => value <= 0.04045
        ? value / 12.92
        : math.pow((value + 0.055) / 1.055, 2.4).toDouble();
    return 0.2126 * channel(color.r) +
        0.7152 * channel(color.g) +
        0.0722 * channel(color.b);
  }

  static double ratio(Color a, Color b) {
    final la = relativeLuminance(a);
    final lb = relativeLuminance(b);
    final lighter = math.max(la, lb);
    final darker = math.min(la, lb);
    return (lighter + 0.05) / (darker + 0.05);
  }

  /// Returns whichever of [light] or [dark] reads better on [background].
  static Color readableOn(
    Color background, {
    required Color light,
    required Color dark,
  }) => ratio(light, background) >= ratio(dark, background) ? light : dark;

  /// Composites a translucent [top] over an opaque [bottom].
  static Color over(Color top, Color bottom) => Color.from(
    alpha: 1,
    red: top.r * top.a + bottom.r * (1 - top.a),
    green: top.g * top.a + bottom.g * (1 - top.a),
    blue: top.b * top.a + bottom.b * (1 - top.a),
  );

  /// Per-channel extreme of [colors]. Any sRGB-space blend of the inputs is
  /// bounded channel by channel, so this is the lightest ([lightest] true) or
  /// darkest possible blended background for contrast checks.
  static Color channelBound(Iterable<Color> colors, {required bool lightest}) {
    final pick = lightest ? math.max<double> : math.min<double>;
    var r = lightest ? 0.0 : 1.0;
    var g = r;
    var b = r;
    for (final color in colors) {
      r = pick(r, color.r);
      g = pick(g, color.g);
      b = pick(b, color.b);
    }
    return Color.from(alpha: 1, red: r, green: g, blue: b);
  }
}
