// Sorbet colour data. Generated from packages/ui/src/sorbet-tokens.json
// (default roles and hues) and packages/ui/src/sorbet-presets.css (preset
// source colours and the High Contrast inks) by
// apps/mobile/tool/generate_sorbet_palettes.py; regenerate rather than edit.
// test/core/theme/sorbet/sorbet_palette_parity_test.dart fails on drift.

import 'dart:ui';

import 'package:mobile/core/theme/sorbet/sorbet_palette_types.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';

/// Sorbet colour data per preset and mode.
abstract final class SorbetPalettes {
  static SorbetSourceColors source(SorbetPreset preset, Brightness b) =>
      (b == Brightness.dark ? _darkSources : _lightSources)[preset]!;

  /// The default palette's roles (`color.<mode>` in sorbet-tokens.json).
  static SorbetRoles defaultRoles(Brightness b) =>
      b == Brightness.dark ? _darkRoles : _lightRoles;

  /// Roles of [preset]; Sorbet itself uses the default palette.
  static SorbetRoles roles(SorbetPreset preset, Brightness b) {
    if (preset == SorbetPreset.sorbet) return defaultRoles(b);
    final base = defaultRoles(b);
    return SorbetRoles.fromSource(
      source(preset, b),
      b,
      destructive: base.destructive,
      destructiveForeground: base.destructiveForeground,
    );
  }

  /// Hues; High Contrast swaps in stronger inks.
  static SorbetHues hues(SorbetPreset preset, Brightness b) {
    final dark = b == Brightness.dark;
    final hues = dark ? _darkHues : _lightHues;
    if (preset != SorbetPreset.highContrast) return hues;
    return hues.withInks(dark ? _highContrastDarkInks : _highContrastLightInks);
  }

  static const _lightSources = <SorbetPreset, SorbetSourceColors>{
    SorbetPreset.sorbet: SorbetSourceColors(
      ground: Color(0xFFFFF1EE),
      surface: Color(0xFFFFFBFA),
      card: Color(0xFFFFFFFF),
      ink: Color(0xFF26212B),
      mutedInk: Color(0xFF6B6170),
      hairline: Color(0xFFF0E1DD),
      input: Color(0xFFDCC8C3),
      accent: Color(0xFF26212B),
      accentInk: Color(0xFFFFFBFA),
      accentSoft: Color(0xFFFFE9E4),
      ring: Color(0xFF2A55A8),
    ),
    SorbetPreset.matcha: SorbetSourceColors(
      ground: Color(0xFFEEF5EA),
      surface: Color(0xFFF9FCF7),
      card: Color(0xFFFFFFFF),
      ink: Color(0xFF1D2A1F),
      mutedInk: Color(0xFF566457),
      hairline: Color(0xFFDCE8D6),
      input: Color(0xFFB9CDB1),
      accent: Color(0xFF2F6B3A),
      accentInk: Color(0xFFFFFFFF),
      accentSoft: Color(0xFFE1F0DC),
      ring: Color(0xFF2F6B3A),
    ),
    SorbetPreset.blueberry: SorbetSourceColors(
      ground: Color(0xFFEDF1FB),
      surface: Color(0xFFF8FAFF),
      card: Color(0xFFFFFFFF),
      ink: Color(0xFF1B2233),
      mutedInk: Color(0xFF565F75),
      hairline: Color(0xFFDBE2F2),
      input: Color(0xFFB5C1DD),
      accent: Color(0xFF2F55C4),
      accentInk: Color(0xFFFFFFFF),
      accentSoft: Color(0xFFE2E9FB),
      ring: Color(0xFF2F55C4),
    ),
    SorbetPreset.mango: SorbetSourceColors(
      ground: Color(0xFFFDF2E3),
      surface: Color(0xFFFFFAF3),
      card: Color(0xFFFFFFFF),
      ink: Color(0xFF2B2117),
      mutedInk: Color(0xFF6B5A47),
      hairline: Color(0xFFF0E0C8),
      input: Color(0xFFDCC3A0),
      accent: Color(0xFF9A4A00),
      accentInk: Color(0xFFFFFFFF),
      accentSoft: Color(0xFFFDE6C8),
      ring: Color(0xFF9A4A00),
    ),
    SorbetPreset.lavender: SorbetSourceColors(
      ground: Color(0xFFF3EFFC),
      surface: Color(0xFFFBF9FF),
      card: Color(0xFFFFFFFF),
      ink: Color(0xFF251F33),
      mutedInk: Color(0xFF625A75),
      hairline: Color(0xFFE5DEF5),
      input: Color(0xFFC6BADF),
      accent: Color(0xFF6236B0),
      accentInk: Color(0xFFFFFFFF),
      accentSoft: Color(0xFFECE4FD),
      ring: Color(0xFF6236B0),
    ),
    SorbetPreset.lagoon: SorbetSourceColors(
      ground: Color(0xFFE9F5F3),
      surface: Color(0xFFF7FCFB),
      card: Color(0xFFFFFFFF),
      ink: Color(0xFF16292A),
      mutedInk: Color(0xFF4F6466),
      hairline: Color(0xFFD4E9E5),
      input: Color(0xFFA8CBC5),
      accent: Color(0xFF12675E),
      accentInk: Color(0xFFFFFFFF),
      accentSoft: Color(0xFFD7F0EB),
      ring: Color(0xFF12675E),
    ),
    SorbetPreset.rose: SorbetSourceColors(
      ground: Color(0xFFFCECF2),
      surface: Color(0xFFFFF8FB),
      card: Color(0xFFFFFFFF),
      ink: Color(0xFF2D1B24),
      mutedInk: Color(0xFF6D5562),
      hairline: Color(0xFFF2DBE5),
      input: Color(0xFFDCBCCB),
      accent: Color(0xFFA2286A),
      accentInk: Color(0xFFFFFFFF),
      accentSoft: Color(0xFFFDE0ED),
      ring: Color(0xFFA2286A),
    ),
    SorbetPreset.graphite: SorbetSourceColors(
      ground: Color(0xFFF1F1F2),
      surface: Color(0xFFFAFAFA),
      card: Color(0xFFFFFFFF),
      ink: Color(0xFF1C1C1F),
      mutedInk: Color(0xFF5B5B63),
      hairline: Color(0xFFE2E2E5),
      input: Color(0xFFC2C2C8),
      accent: Color(0xFF1C1C1F),
      accentInk: Color(0xFFFAFAFA),
      accentSoft: Color(0xFFECECEE),
      ring: Color(0xFF3B5BDB),
    ),
    SorbetPreset.midnight: SorbetSourceColors(
      ground: Color(0xFFECEEFB),
      surface: Color(0xFFF7F8FF),
      card: Color(0xFFFFFFFF),
      ink: Color(0xFF191B33),
      mutedInk: Color(0xFF575A78),
      hairline: Color(0xFFDCDFF3),
      input: Color(0xFFB7BBDC),
      accent: Color(0xFF4338CA),
      accentInk: Color(0xFFFFFFFF),
      accentSoft: Color(0xFFE3E3FC),
      ring: Color(0xFF4338CA),
    ),
    SorbetPreset.highContrast: SorbetSourceColors(
      ground: Color(0xFFFFFFFF),
      surface: Color(0xFFFFFFFF),
      card: Color(0xFFFFFFFF),
      ink: Color(0xFF000000),
      mutedInk: Color(0xFF333333),
      hairline: Color(0xFF1A1A1A),
      input: Color(0xFF000000),
      accent: Color(0xFF0B3D91),
      accentInk: Color(0xFFFFFFFF),
      accentSoft: Color(0xFFE6EEFF),
      ring: Color(0xFF0B3D91),
    ),
  };

  static const _darkSources = <SorbetPreset, SorbetSourceColors>{
    SorbetPreset.sorbet: SorbetSourceColors(
      ground: Color(0xFF1D1A22),
      surface: Color(0xFF18151C),
      card: Color(0xFF211D26),
      ink: Color(0xFFF6EFF4),
      mutedInk: Color(0xFFB3A8B5),
      hairline: Color(0xFF3A3241),
      input: Color(0xFF544A5C),
      accent: Color(0xFFF6EFF4),
      accentInk: Color(0xFF18151C),
      accentSoft: Color(0xFF2F2935),
      ring: Color(0xFFB5CDFF),
    ),
    SorbetPreset.matcha: SorbetSourceColors(
      ground: Color(0xFF141B16),
      surface: Color(0xFF111712),
      card: Color(0xFF1A221C),
      ink: Color(0xFFEAF3E6),
      mutedInk: Color(0xFFA5B5A2),
      hairline: Color(0xFF2C3A2E),
      input: Color(0xFF46594A),
      accent: Color(0xFF8FD69A),
      accentInk: Color(0xFF0F1A12),
      accentSoft: Color(0xFF24362A),
      ring: Color(0xFF8FD69A),
    ),
    SorbetPreset.blueberry: SorbetSourceColors(
      ground: Color(0xFF12151F),
      surface: Color(0xFF0F121B),
      card: Color(0xFF181C28),
      ink: Color(0xFFE8EDFB),
      mutedInk: Color(0xFFA3ABC2),
      hairline: Color(0xFF2A3042),
      input: Color(0xFF444D66),
      accent: Color(0xFF9DB6FF),
      accentInk: Color(0xFF0F1424),
      accentSoft: Color(0xFF222B45),
      ring: Color(0xFF9DB6FF),
    ),
    SorbetPreset.mango: SorbetSourceColors(
      ground: Color(0xFF1C1610),
      surface: Color(0xFF18130D),
      card: Color(0xFF221B13),
      ink: Color(0xFFFBEFE0),
      mutedInk: Color(0xFFC2AD94),
      hairline: Color(0xFF3A2E20),
      input: Color(0xFF5A4733),
      accent: Color(0xFFFFB866),
      accentInk: Color(0xFF241605),
      accentSoft: Color(0xFF3A2A17),
      ring: Color(0xFFFFB866),
    ),
    SorbetPreset.lavender: SorbetSourceColors(
      ground: Color(0xFF18141F),
      surface: Color(0xFF15111C),
      card: Color(0xFF1F1A28),
      ink: Color(0xFFF1ECFB),
      mutedInk: Color(0xFFB2A8C4),
      hairline: Color(0xFF332B42),
      input: Color(0xFF4F4563),
      accent: Color(0xFFC9B2FF),
      accentInk: Color(0xFF1B1229),
      accentSoft: Color(0xFF2E2442),
      ring: Color(0xFFC9B2FF),
    ),
    SorbetPreset.lagoon: SorbetSourceColors(
      ground: Color(0xFF101B1B),
      surface: Color(0xFF0D1717),
      card: Color(0xFF152222),
      ink: Color(0xFFE4F4F1),
      mutedInk: Color(0xFF9BB8B3),
      hairline: Color(0xFF253837),
      input: Color(0xFF3E5856),
      accent: Color(0xFF7FDCCD),
      accentInk: Color(0xFF082220),
      accentSoft: Color(0xFF1B3634),
      ring: Color(0xFF7FDCCD),
    ),
    SorbetPreset.rose: SorbetSourceColors(
      ground: Color(0xFF1E141A),
      surface: Color(0xFF1A1116),
      card: Color(0xFF241820),
      ink: Color(0xFFFBE9F1),
      mutedInk: Color(0xFFC4A6B5),
      hairline: Color(0xFF3C2934),
      input: Color(0xFF5B4250),
      accent: Color(0xFFFFA8CF),
      accentInk: Color(0xFF2A0F1C),
      accentSoft: Color(0xFF3B2030),
      ring: Color(0xFFFFA8CF),
    ),
    SorbetPreset.graphite: SorbetSourceColors(
      ground: Color(0xFF161618),
      surface: Color(0xFF121214),
      card: Color(0xFF1C1C1F),
      ink: Color(0xFFEDEDEF),
      mutedInk: Color(0xFFA5A5AD),
      hairline: Color(0xFF2E2E33),
      input: Color(0xFF4A4A52),
      accent: Color(0xFFEDEDEF),
      accentInk: Color(0xFF121214),
      accentSoft: Color(0xFF26262A),
      ring: Color(0xFF8FA8FF),
    ),
    SorbetPreset.midnight: SorbetSourceColors(
      ground: Color(0xFF0B0D1A),
      surface: Color(0xFF080A15),
      card: Color(0xFF11142A),
      ink: Color(0xFFE7E9FF),
      mutedInk: Color(0xFFA2A6CC),
      hairline: Color(0xFF22264A),
      input: Color(0xFF3C4170),
      accent: Color(0xFFA5B0FF),
      accentInk: Color(0xFF0C0F2B),
      accentSoft: Color(0xFF1D2250),
      ring: Color(0xFFA5B0FF),
    ),
    SorbetPreset.highContrast: SorbetSourceColors(
      ground: Color(0xFF000000),
      surface: Color(0xFF000000),
      card: Color(0xFF0A0A0A),
      ink: Color(0xFFFFFFFF),
      mutedInk: Color(0xFFD6D6D6),
      hairline: Color(0xFFF0F0F0),
      input: Color(0xFFFFFFFF),
      accent: Color(0xFF9EC5FF),
      accentInk: Color(0xFF000000),
      accentSoft: Color(0xFF10203D),
      ring: Color(0xFF9EC5FF),
    ),
  };

  static const _lightRoles = SorbetRoles(
    ground: Color(0xFFFFF1EE),
    background: Color(0xFFFFFBFA),
    surface: Color(0xFFFFFFFF),
    surfaceSunken: Color(0xFFFFF1EE),
    accent: Color(0xFFFFE9E4),
    border: Color(0xFFF0E1DD),
    borderStrong: Color(0xFFDCC8C3),
    foreground: Color(0xFF26212B),
    mutedForeground: Color(0xFF6B6170),
    primary: Color(0xFF26212B),
    primaryForeground: Color(0xFFFFFBFA),
    destructive: Color(0xFFA8302E),
    destructiveForeground: Color(0xFFFFFFFF),
    ring: Color(0xFF2A55A8),
    scrim: Color.fromRGBO(38, 33, 43, 0.32),
    hover: Color.fromRGBO(38, 33, 43, 0.04),
  );

  static const _darkRoles = SorbetRoles(
    ground: Color(0xFF1D1A22),
    background: Color(0xFF18151C),
    surface: Color(0xFF211D26),
    surfaceSunken: Color(0xFF2A2530),
    accent: Color(0xFF2F2935),
    border: Color(0xFF3A3241),
    borderStrong: Color(0xFF544A5C),
    foreground: Color(0xFFF6EFF4),
    mutedForeground: Color(0xFFB3A8B5),
    primary: Color(0xFFF6EFF4),
    primaryForeground: Color(0xFF18151C),
    destructive: Color(0xFFFFB3AE),
    destructiveForeground: Color(0xFF18151C),
    ring: Color(0xFFB5CDFF),
    scrim: Color.fromRGBO(0, 0, 0, 0.6),
    hover: Color.fromRGBO(246, 239, 244, 0.05),
  );

  static const _lightHues = SorbetHues(
    blue: SorbetHue(
      fill: Color(0xFFC6DAFF),
      calm: Color(0xFFDCE7FF),
      ink: Color(0xFF2A55A8),
    ),
    green: SorbetHue(
      fill: Color(0xFFC6F0BC),
      calm: Color(0xFFDCF3D6),
      ink: Color(0xFF2B6E22),
    ),
    orange: SorbetHue(
      fill: Color(0xFFFFD6A8),
      calm: Color(0xFFFFE4CA),
      ink: Color(0xFF94480A),
    ),
    red: SorbetHue(
      fill: Color(0xFFFFC9C4),
      calm: Color(0xFFFFDDDB),
      ink: Color(0xFFA8302E),
    ),
    yellow: SorbetHue(
      fill: Color(0xFFFFE896),
      calm: Color(0xFFFFF2C2),
      ink: Color(0xFF7A5800),
    ),
    purple: SorbetHue(
      fill: Color(0xFFDDCDFF),
      calm: Color(0xFFECE1FF),
      ink: Color(0xFF6236B0),
    ),
    pink: SorbetHue(
      fill: Color(0xFFFFC8E3),
      calm: Color(0xFFFFDEEE),
      ink: Color(0xFFA2286A),
    ),
    teal: SorbetHue(
      fill: Color(0xFFB9EBE2),
      calm: Color(0xFFD4F2EE),
      ink: Color(0xFF17675E),
    ),
    gray: SorbetHue(
      fill: Color(0xFFE6DFE5),
      calm: Color(0xFFEFEBEE),
      ink: Color(0xFF5A535C),
    ),
  );

  static const _darkHues = SorbetHues(
    blue: SorbetHue(
      fill: Color(0xFF22396B),
      calm: Color(0xFF22304F),
      ink: Color(0xFFB5CDFF),
    ),
    green: SorbetHue(
      fill: Color(0xFF1E4A24),
      calm: Color(0xFF1F3A22),
      ink: Color(0xFFAEE6A4),
    ),
    orange: SorbetHue(
      fill: Color(0xFF55321A),
      calm: Color(0xFF3F2A17),
      ink: Color(0xFFFFC996),
    ),
    red: SorbetHue(
      fill: Color(0xFF5C2525),
      calm: Color(0xFF432121),
      ink: Color(0xFFFFB3AE),
    ),
    yellow: SorbetHue(
      fill: Color(0xFF4A3C10),
      calm: Color(0xFF3A3115),
      ink: Color(0xFFF5D97A),
    ),
    purple: SorbetHue(
      fill: Color(0xFF3A2861),
      calm: Color(0xFF2F2347),
      ink: Color(0xFFD3BCFF),
    ),
    pink: SorbetHue(
      fill: Color(0xFF592341),
      calm: Color(0xFF422033),
      ink: Color(0xFFFFB4D6),
    ),
    teal: SorbetHue(
      fill: Color(0xFF13443C),
      calm: Color(0xFF17332F),
      ink: Color(0xFF93E0D5),
    ),
    gray: SorbetHue(
      fill: Color(0xFF342E38),
      calm: Color(0xFF2C2830),
      ink: Color(0xFFC9C0CA),
    ),
  );

  // blue, green, orange, red, yellow, purple, pink, teal, gray.
  static const _highContrastLightInks = <Color>[
    Color(0xFF123F8C),
    Color(0xFF1D5016),
    Color(0xFF6E3300),
    Color(0xFF8A1C1A),
    Color(0xFF5A4100),
    Color(0xFF4A2390),
    Color(0xFF7D1A50),
    Color(0xFF0C4D46),
    Color(0xFF3D383F),
  ];

  // blue, green, orange, red, yellow, purple, pink, teal, gray.
  static const _highContrastDarkInks = <Color>[
    Color(0xFFCFE0FF),
    Color(0xFFC7F0BF),
    Color(0xFFFFDCB8),
    Color(0xFFFFCDC9),
    Color(0xFFF9E6A6),
    Color(0xFFE4D6FF),
    Color(0xFFFFCFE5),
    Color(0xFFB6EFE6),
    Color(0xFFE0DAE1),
  ];
}
