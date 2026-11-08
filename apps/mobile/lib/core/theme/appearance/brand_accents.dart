import 'dart:ui';

/// One Tuturuuu brand colour with a fill per brightness and the label colour
/// that reads on each fill.
///
/// Light fills are shades of the brand mark deep enough for white labels;
/// dark fills are the mark or a tint of it, lifted where a mark is too close
/// to the darkest ambient backgrounds, and carry near-black labels. Every
/// fill keeps the mark's hue.
/// Both pairs reach WCAG AA (4.5:1), and both fills reach 3:1 against every
/// appearance surface of their brightness; `brand_accents_contrast_test.dart`
/// enforces this.
class BrandAccent {
  const BrandAccent({
    required this.name,
    required this.mark,
    required this.light,
    required this.dark,
    this.onLight = BrandAccents.paper,
    this.onDark = BrandAccents.ink,
  });

  /// Brand name of the colour, such as `innovation`.
  final String name;

  /// The published brand colour. Fills are tuned from it for contrast; use
  /// the mark itself only for brand artwork, not for UI fills.
  final Color mark;
  final Color light;
  final Color dark;
  final Color onLight;
  final Color onDark;

  Color fill(Brightness brightness) =>
      brightness == Brightness.dark ? dark : light;

  Color onFill(Brightness brightness) =>
      brightness == Brightness.dark ? onDark : onLight;

  /// Quiet wash of the fill behind selected rows and cards. Body text stays
  /// in the theme foreground, which keeps AA on the wash.
  Color tint(Brightness brightness) => fill(
    brightness,
  ).withValues(alpha: brightness == Brightness.dark ? 0.16 : 0.10);
}

/// The Tuturuuu brand palette (https://tuturuuu.com/branding).
///
/// [core] are the four logo marks: Innovation blue `#4180E9`, Growth green
/// `#4ACA3F`, Energy orange `#FB7B05` and Impact red `#E94646`. [strong]
/// holds a shade (light mode) or tint (dark mode) of each, so identity
/// colours stay distinct across many items without leaving the brand hues.
/// Use [forKey] for a stable per-object colour.
abstract final class BrandAccents {
  /// Brand dark background (`#09090B`), the label colour on dark fills.
  static const Color ink = Color(0xFF09090B);

  /// Brand light background (`#FFFFFF`), the label colour on light fills.
  static const Color paper = Color(0xFFFFFFFF);

  static const innovation = BrandAccent(
    name: 'innovation',
    mark: Color(0xFF4180E9),
    light: Color(0xFF376CC5),
    dark: Color(0xFF528BEB),
  );
  static const growth = BrandAccent(
    name: 'growth',
    mark: Color(0xFF4ACA3F),
    light: Color(0xFF2F7F28),
    dark: Color(0xFF4ACA3F),
  );
  static const energy = BrandAccent(
    name: 'energy',
    mark: Color(0xFFFB7B05),
    light: Color(0xFFB05604),
    dark: Color(0xFFFB7B05),
  );
  static const impact = BrandAccent(
    name: 'impact',
    mark: Color(0xFFE94646),
    light: Color(0xFFC93C3C),
    dark: Color(0xFFEC5C5C),
  );
  static const innovationStrong = BrandAccent(
    name: 'innovation-strong',
    mark: Color(0xFF4180E9),
    light: Color(0xFF2A5397),
    dark: Color(0xFFA6C3F5),
  );
  static const growthStrong = BrandAccent(
    name: 'growth-strong',
    mark: Color(0xFF4ACA3F),
    light: Color(0xFF235F1E),
    dark: Color(0xFF75D76D),
  );
  static const energyStrong = BrandAccent(
    name: 'energy-strong',
    mark: Color(0xFFFB7B05),
    light: Color(0xFF854103),
    dark: Color(0xFFFDB16C),
  );
  static const impactStrong = BrandAccent(
    name: 'impact-strong',
    mark: Color(0xFFE94646),
    light: Color(0xFF972D2D),
    dark: Color(0xFFF6AFAF),
  );

  /// The four logo marks, in logo order.
  static const List<BrandAccent> core = [innovation, growth, energy, impact];

  /// The same four hues one step further from the page: a deeper shade in
  /// light mode and a lighter tint in dark mode.
  static const List<BrandAccent> strong = [
    innovationStrong,
    growthStrong,
    energyStrong,
    impactStrong,
  ];

  /// Identity palette: only the four brand hues, each at its base step and
  /// its strong step. Do not reorder: people learn an object's colour, and
  /// [forKey] indexes this list.
  static const List<BrandAccent> identity = [...core, ...strong];

  /// Stable identity colour for [key] (for example a workspace id). Uses a
  /// 32-bit FNV-1a hash, which, unlike `String.hashCode`, is the same on
  /// every platform, run and Dart version.
  static BrandAccent forKey(String key) => identity[indexForKey(key)];

  static int indexForKey(String key) {
    var hash = 0x811C9DC5;
    for (final unit in key.codeUnits) {
      hash ^= unit;
      // hash * 0x01000193 (2^24 + 0x193), split to stay within 53 bits.
      hash = (((hash << 24) & 0xFFFFFFFF) + hash * 0x193) & 0xFFFFFFFF;
    }
    return hash % identity.length;
  }
}
