import 'dart:ui';

import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/brand_accents.dart';
import 'package:mobile/core/theme/colors.dart';

/// Colour tokens for one brightness of a background theme.
///
/// Gradient and blob colours are chosen so foreground and muted text keep at
/// least WCAG AA (4.5:1) contrast against any blend of them with [base];
/// `appearance_contrast_test.dart` enforces this for every theme.
class AppearanceTones {
  const AppearanceTones({
    required this.base,
    required this.foreground,
    required this.muted,
    required this.gradient,
    required this.blobs,
  });

  final Color base;
  final Color foreground;
  final Color muted;

  /// Ombre stops painted top-leading to bottom-trailing.
  final List<Color> gradient;

  /// Soft radial blob colours, largest first.
  final List<Color> blobs;
}

class AppearancePalette {
  const AppearancePalette({
    required this.id,
    required this.preferredStyle,
    required this.accent,
    required this.light,
    required this.dark,
  });

  final AppearanceThemeId id;

  /// Background style applied when this theme is picked from the gallery.
  final AppearanceBackgroundStyle preferredStyle;

  /// Accent used when the accent preference follows the theme.
  final AppearanceAccentId accent;
  final AppearanceTones light;
  final AppearanceTones dark;

  AppearanceTones tones(Brightness brightness) =>
      brightness == Brightness.dark ? dark : light;
}

/// Accent colours per brightness. Light accents carry white labels and dark
/// accents carry near-black labels; both meet AA against their label colour.
class AppearanceAccent {
  const AppearanceAccent({required this.light, required this.dark});

  final Color light;
  final Color dark;

  Color resolve(Brightness brightness) =>
      brightness == Brightness.dark ? dark : light;
}

/// The single source of curated appearance colour values. Classic mirrors the
/// original zinc scheme so the default appearance is unchanged.
abstract final class AppearancePalettes {
  static const Color _ink = AppColors.textPrimaryLight;
  static const Color _paper = AppColors.textPrimaryDark;
  static const _inkMuted = Color(0xFF52525B);
  static const _paperMuted = Color(0xFFC4C4CC);
  static const _classicMuted = Color(0xFF5E5E66);

  static const classic = AppearancePalette(
    id: AppearanceThemeId.classic,
    preferredStyle: AppearanceBackgroundStyle.solid,
    accent: AppearanceAccentId.neutral,
    light: AppearanceTones(
      base: Color(0xFFF2F2F7),
      foreground: _ink,
      muted: _classicMuted,
      gradient: [Color(0xFFFCFAF6), Color(0xFFF4EFE7), Color(0xFFEEEAF4)],
      blobs: [Color(0xFFE9E3F7), Color(0xFFE3EFEA), Color(0xFFF6E7DA)],
    ),
    dark: AppearanceTones(
      base: Color(0xFF09090B),
      foreground: _paper,
      muted: AppColors.textSecondaryDark,
      gradient: [Color(0xFF14141C), Color(0xFF0B0B0E), Color(0xFF1C1828)],
      blobs: [Color(0xFF2B2650), Color(0xFF173036), Color(0xFF33261C)],
    ),
  );

  static const aurora = AppearancePalette(
    id: AppearanceThemeId.aurora,
    preferredStyle: AppearanceBackgroundStyle.blobs,
    accent: AppearanceAccentId.teal,
    light: AppearanceTones(
      base: Color(0xFFF4FAF8),
      foreground: _ink,
      muted: _inkMuted,
      gradient: [Color(0xFFE2F5EE), Color(0xFFEAF1FB), Color(0xFFEFE9FA)],
      blobs: [Color(0xFFBFEBDA), Color(0xFFCBDDF8), Color(0xFFDDCFF5)],
    ),
    dark: AppearanceTones(
      base: Color(0xFF07111A),
      foreground: _paper,
      muted: _paperMuted,
      gradient: [Color(0xFF0A1D24), Color(0xFF0C1A2E), Color(0xFF1A1433)],
      blobs: [Color(0xFF0C3F3B), Color(0xFF12305A), Color(0xFF301E55)],
    ),
  );

  static const sunset = AppearancePalette(
    id: AppearanceThemeId.sunset,
    preferredStyle: AppearanceBackgroundStyle.gradient,
    accent: AppearanceAccentId.orange,
    light: AppearanceTones(
      base: Color(0xFFFFF7F2),
      foreground: _ink,
      muted: _inkMuted,
      gradient: [Color(0xFFFFE4D4), Color(0xFFFCDDE7), Color(0xFFEEDFF5)],
      blobs: [Color(0xFFFFD2B8), Color(0xFFFACADA), Color(0xFFE3CEF2)],
    ),
    dark: AppearanceTones(
      base: Color(0xFF150B10),
      foreground: _paper,
      muted: _paperMuted,
      gradient: [Color(0xFF2E1410), Color(0xFF2B0F1F), Color(0xFF1D1030)],
      blobs: [Color(0xFF4A1E10), Color(0xFF47142D), Color(0xFF2B154C)],
    ),
  );

  static const ocean = AppearancePalette(
    id: AppearanceThemeId.ocean,
    preferredStyle: AppearanceBackgroundStyle.gradient,
    accent: AppearanceAccentId.blue,
    light: AppearanceTones(
      base: Color(0xFFF3F8FC),
      foreground: _ink,
      muted: _inkMuted,
      gradient: [Color(0xFFDDEDFA), Color(0xFFDDF3F4), Color(0xFFE9ECFB)],
      blobs: [Color(0xFFC3DFF6), Color(0xFFC1EAEB), Color(0xFFD3D9F6)],
    ),
    dark: AppearanceTones(
      base: Color(0xFF06101B),
      foreground: _paper,
      muted: _paperMuted,
      gradient: [Color(0xFF081A2E), Color(0xFF062328), Color(0xFF0D1430)],
      blobs: [Color(0xFF0C3157), Color(0xFF093C43), Color(0xFF1A2459)],
    ),
  );

  static const forest = AppearancePalette(
    id: AppearanceThemeId.forest,
    preferredStyle: AppearanceBackgroundStyle.blobs,
    accent: AppearanceAccentId.green,
    light: AppearanceTones(
      base: Color(0xFFF5F8F2),
      foreground: _ink,
      muted: _inkMuted,
      gradient: [Color(0xFFE6F0DF), Color(0xFFEDF3E4), Color(0xFFF3EFE1)],
      blobs: [Color(0xFFCFE4C2), Color(0xFFDAEAC7), Color(0xFFE9DDC3)],
    ),
    dark: AppearanceTones(
      base: Color(0xFF0A110C),
      foreground: _paper,
      muted: _paperMuted,
      gradient: [Color(0xFF0E1C13), Color(0xFF13200F), Color(0xFF1C1B10)],
      blobs: [Color(0xFF183A22), Color(0xFF243E17), Color(0xFF3B3116)],
    ),
  );

  static const ember = AppearancePalette(
    id: AppearanceThemeId.ember,
    preferredStyle: AppearanceBackgroundStyle.gradient,
    accent: AppearanceAccentId.amber,
    light: AppearanceTones(
      base: Color(0xFFFBF7F1),
      foreground: _ink,
      muted: _inkMuted,
      gradient: [Color(0xFFF4E8D7), Color(0xFFF2E6DF), Color(0xFFECE6E1)],
      blobs: [Color(0xFFEDD6B6), Color(0xFFE8D0C3), Color(0xFFDCD2C8)],
    ),
    dark: AppearanceTones(
      base: Color(0xFF0E0C0B),
      foreground: _paper,
      muted: _paperMuted,
      gradient: [Color(0xFF3A2A18), Color(0xFF1E1610), Color(0xFF120E0B)],
      blobs: [Color(0xFF4E3620), Color(0xFF3A2416), Color(0xFF2E2A24)],
    ),
  );

  static const blossom = AppearancePalette(
    id: AppearanceThemeId.blossom,
    preferredStyle: AppearanceBackgroundStyle.blobs,
    accent: AppearanceAccentId.rose,
    light: AppearanceTones(
      base: Color(0xFFFFF6F8),
      foreground: _ink,
      muted: _inkMuted,
      gradient: [Color(0xFFFCE4EC), Color(0xFFF8E6F4), Color(0xFFFFEDE3)],
      blobs: [Color(0xFFF8CCDA), Color(0xFFEDD0EC), Color(0xFFFFD8C4)],
    ),
    dark: AppearanceTones(
      base: Color(0xFF150A10),
      foreground: _paper,
      muted: _paperMuted,
      gradient: [Color(0xFF26101A), Color(0xFF211024), Color(0xFF2A1512)],
      blobs: [Color(0xFF4A1730), Color(0xFF3D1847), Color(0xFF4A2316)],
    ),
  );

  static const mono = AppearancePalette(
    id: AppearanceThemeId.mono,
    preferredStyle: AppearanceBackgroundStyle.gradient,
    accent: AppearanceAccentId.neutral,
    light: AppearanceTones(
      base: Color(0xFFF7F7F8),
      foreground: _ink,
      muted: _inkMuted,
      gradient: [Color(0xFFF4F4F5), Color(0xFFEBEBED), Color(0xFFE1E1E5)],
      blobs: [Color(0xFFE4E4E7), Color(0xFFD9D9DE), Color(0xFFEFEFF1)],
    ),
    dark: AppearanceTones(
      base: Color(0xFF0B0B0C),
      foreground: _paper,
      muted: _paperMuted,
      gradient: [Color(0xFF26262B), Color(0xFF111113), Color(0xFF2E2E34)],
      blobs: [Color(0xFF3C3C44), Color(0xFF2A2A30), Color(0xFF34343C)],
    ),
  );

  /// Gallery order: the featured Aurora first, then Classic.
  static const List<AppearancePalette> all = [
    aurora,
    classic,
    sunset,
    ocean,
    forest,
    ember,
    blossom,
    mono,
  ];

  static AppearancePalette of(AppearanceThemeId id) =>
      all.firstWhere((palette) => palette.id == id);

  static const accents = <AppearanceAccentId, AppearanceAccent>{
    AppearanceAccentId.neutral: AppearanceAccent(
      light: Color(0xFF18181B),
      dark: Color(0xFFFAFAFA),
    ),
    AppearanceAccentId.indigo: AppearanceAccent(
      light: Color(0xFF4F46E5),
      dark: Color(0xFF8B95F9),
    ),
    AppearanceAccentId.blue: AppearanceAccent(
      light: Color(0xFF1D4ED8),
      dark: Color(0xFF6CB0FB),
    ),
    AppearanceAccentId.teal: AppearanceAccent(
      light: Color(0xFF0F766E),
      dark: Color(0xFF2DD4BF),
    ),
    AppearanceAccentId.green: AppearanceAccent(
      light: Color(0xFF15803D),
      dark: Color(0xFF4ADE80),
    ),
    AppearanceAccentId.amber: AppearanceAccent(
      light: Color(0xFFA14A08),
      dark: Color(0xFFE0B872),
    ),
    AppearanceAccentId.orange: AppearanceAccent(
      light: Color(0xFFC2410C),
      dark: Color(0xFFFB923C),
    ),
    AppearanceAccentId.rose: AppearanceAccent(
      light: Color(0xFFBE123C),
      dark: Color(0xFFFB7F92),
    ),
    AppearanceAccentId.violet: AppearanceAccent(
      light: Color(0xFF7C3AED),
      dark: Color(0xFFAE95FB),
    ),
  };

  /// Tuturuuu logo marks (Innovation, Growth, Energy, Impact) with fills and
  /// labels per brightness. See [BrandAccents].
  static const List<BrandAccent> brandAccents = BrandAccents.core;

  /// Brand marks plus companions, for stable per-object identity colours
  /// ([BrandAccents.forKey]). Theme-independent: an object keeps its colour
  /// across appearances.
  static const List<BrandAccent> identityAccents = BrandAccents.identity;

  /// Resolves [AppearanceAccentId.theme] to the palette's recommended accent.
  static AppearanceAccentId effectiveAccentId(AppearanceSettings settings) =>
      settings.accent == AppearanceAccentId.theme
      ? of(settings.theme).accent
      : settings.accent;

  static Color accentColor(
    AppearanceSettings settings,
    Brightness brightness,
  ) => accents[effectiveAccentId(settings)]!.resolve(brightness);
}
