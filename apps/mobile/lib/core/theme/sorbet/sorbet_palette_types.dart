import 'dart:ui';

import 'package:flutter/foundation.dart';

/// The eleven Sorbet source colours of one preset in one mode
/// (`--sorbet-*` in `packages/ui/src/sorbet-presets.css`).
@immutable
class SorbetSourceColors {
  const SorbetSourceColors({
    required this.ground,
    required this.surface,
    required this.card,
    required this.ink,
    required this.mutedInk,
    required this.hairline,
    required this.input,
    required this.accent,
    required this.accentInk,
    required this.accentSoft,
    required this.ring,
  });

  final Color ground;
  final Color surface;
  final Color card;
  final Color ink;
  final Color mutedInk;
  final Color hairline;
  final Color input;
  final Color accent;
  final Color accentInk;
  final Color accentSoft;
  final Color ring;

  /// Colours keyed by their CSS name without the `--sorbet-` prefix.
  Map<String, Color> get byCssName => {
    'ground': ground,
    'surface': surface,
    'card': card,
    'ink': ink,
    'muted-ink': mutedInk,
    'hairline': hairline,
    'input': input,
    'accent': accent,
    'accent-ink': accentInk,
    'accent-soft': accentSoft,
    'ring': ring,
  };
}

/// The Sorbet colour roles (`color.<mode>` in `sorbet-tokens.json`).
@immutable
class SorbetRoles {
  const SorbetRoles({
    required this.ground,
    required this.background,
    required this.surface,
    required this.surfaceSunken,
    required this.accent,
    required this.border,
    required this.borderStrong,
    required this.fieldStroke,
    required this.foreground,
    required this.mutedForeground,
    required this.primary,
    required this.primaryForeground,
    required this.destructive,
    required this.destructiveForeground,
    required this.ring,
    required this.scrim,
    required this.hover,
  });

  /// Roles of a preset, through the mapping block in `sorbet-presets.css`.
  /// Scrim and hover follow the default palette's recipe: an ink veil in
  /// light mode, a black veil in dark mode, and a faint ink hover.
  factory SorbetRoles.fromSource(
    SorbetSourceColors source,
    Brightness brightness, {
    required Color destructive,
    required Color destructiveForeground,
    required Color fieldStroke,
  }) {
    final dark = brightness == Brightness.dark;
    return SorbetRoles(
      ground: source.ground,
      background: source.surface,
      surface: source.card,
      surfaceSunken: source.ground,
      accent: source.accentSoft,
      border: source.hairline,
      borderStrong: source.input,
      fieldStroke: fieldStroke,
      foreground: source.ink,
      mutedForeground: source.mutedInk,
      primary: source.accent,
      primaryForeground: source.accentInk,
      destructive: destructive,
      destructiveForeground: destructiveForeground,
      ring: source.ring,
      scrim: dark
          ? const Color(0x99000000)
          : source.ink.withValues(alpha: 0.32),
      hover: source.ink.withValues(alpha: dark ? 0.05 : 0.04),
    );
  }

  final Color ground;
  final Color background;

  /// Cards and popovers.
  final Color surface;
  final Color surfaceSunken;
  final Color accent;
  final Color border;
  final Color borderStrong;

  /// Edges of text fields, OTP cells and checkboxes: 3:1 against a field,
  /// where [borderStrong] is a 1.6:1 hairline. Presets keep the default value.
  final Color fieldStroke;
  final Color foreground;
  final Color mutedForeground;
  final Color primary;
  final Color primaryForeground;
  final Color destructive;
  final Color destructiveForeground;
  final Color ring;
  final Color scrim;
  final Color hover;

  /// Colours keyed by their `sorbet-tokens.json` name.
  Map<String, Color> get byJsonName => {
    'ground': ground,
    'background': background,
    'surface': surface,
    'surface-sunken': surfaceSunken,
    'accent': accent,
    'border': border,
    'border-strong': borderStrong,
    'field-stroke': fieldStroke,
    'foreground': foreground,
    'muted-foreground': mutedForeground,
    'primary': primary,
    'primary-foreground': primaryForeground,
    'destructive': destructive,
    'destructive-foreground': destructiveForeground,
    'ring': ring,
    'scrim': scrim,
    'hover': hover,
  };
}

/// One hue: a pastel [fill], a quieter [calm] fill and its text [ink].
@immutable
class SorbetHue {
  const SorbetHue({required this.fill, required this.calm, required this.ink});

  factory SorbetHue.lerp(SorbetHue a, SorbetHue b, double t) => SorbetHue(
    fill: Color.lerp(a.fill, b.fill, t)!,
    calm: Color.lerp(a.calm, b.calm, t)!,
    ink: Color.lerp(a.ink, b.ink, t)!,
  );

  final Color fill;
  final Color calm;
  final Color ink;

  SorbetHue withInk(Color ink) => SorbetHue(fill: fill, calm: calm, ink: ink);
}

/// The nine Sorbet hues (`hues` in `sorbet-tokens.json`).
@immutable
class SorbetHues {
  const SorbetHues({
    required this.blue,
    required this.green,
    required this.orange,
    required this.red,
    required this.yellow,
    required this.purple,
    required this.pink,
    required this.teal,
    required this.gray,
  });

  factory SorbetHues.lerp(SorbetHues a, SorbetHues b, double t) =>
      SorbetHues._from([
        for (var i = 0; i < names.length; i++)
          SorbetHue.lerp(a._all[i], b._all[i], t),
      ]);

  factory SorbetHues._from(List<SorbetHue> h) => SorbetHues(
    blue: h[0],
    green: h[1],
    orange: h[2],
    red: h[3],
    yellow: h[4],
    purple: h[5],
    pink: h[6],
    teal: h[7],
    gray: h[8],
  );

  /// Hue names in token order.
  static const names = [
    'blue',
    'green',
    'orange',
    'red',
    'yellow',
    'purple',
    'pink',
    'teal',
    'gray',
  ];

  final SorbetHue blue;
  final SorbetHue green;
  final SorbetHue orange;
  final SorbetHue red;
  final SorbetHue yellow;
  final SorbetHue purple;
  final SorbetHue pink;
  final SorbetHue teal;
  final SorbetHue gray;

  List<SorbetHue> get _all => [
    blue,
    green,
    orange,
    red,
    yellow,
    purple,
    pink,
    teal,
    gray,
  ];

  Map<String, SorbetHue> get byName => {
    for (var i = 0; i < names.length; i++) names[i]: _all[i],
  };

  /// These hues with [inks] (in [names] order) as their text colours.
  SorbetHues withInks(List<Color> inks) => SorbetHues._from([
    for (var i = 0; i < names.length; i++) _all[i].withInk(inks[i]),
  ]);
}
