import 'package:flutter/material.dart' as material;
import 'package:flutter/widgets.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/theme/appearance/appearance_palettes.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/colors.dart';
import 'package:mobile/core/theme/mobile_shad_theme.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Derives app-wide shad and Material themes from [AppearanceSettings].
///
/// The default appearance returns the original [MobileShadTheme] and
/// [AppTheme] instances, so users who never customise see no change.
abstract final class AppearanceTheme {
  static final _shadCache =
      <(AppearanceSettings, Brightness), shad.ThemeData>{};
  static final _materialCache =
      <(AppearanceSettings, Brightness), material.ThemeData>{};

  /// Classic, neutral and solid is the original look. Ambient styles derive
  /// a scheme even for Classic so muted text stays AA over the gradient.
  static bool _usesBaseScheme(AppearanceSettings settings) =>
      settings.theme == AppearanceThemeId.classic &&
      !settings.hasAmbientBackground &&
      AppearancePalettes.effectiveAccentId(settings) ==
          AppearanceAccentId.neutral;

  static shad.ThemeData shadTheme(AppearanceSettings settings, Brightness b) {
    final base = b == Brightness.dark
        ? MobileShadTheme.dark
        : MobileShadTheme.light;
    if (_usesBaseScheme(settings)) return base;
    final key = (_colorKey(settings), b);
    return _remember(
      _shadCache,
      key,
      () => base.copyWith(colorScheme: () => colorScheme(settings, b)),
    );
  }

  static material.ThemeData materialTheme(
    AppearanceSettings settings,
    Brightness b,
  ) {
    final base = b == Brightness.dark ? AppTheme.dark : AppTheme.light;
    if (_usesBaseScheme(settings)) return base;
    final key = (_colorKey(settings), b);
    return _remember(_materialCache, key, () {
      final scheme = colorScheme(settings, b);
      final page = settings.hasAmbientBackground
          ? const Color(0x00000000)
          : scheme.background;
      final neutral =
          AppearancePalettes.effectiveAccentId(settings) ==
          AppearanceAccentId.neutral;
      return base.copyWith(
        scaffoldBackgroundColor: page,
        colorScheme: base.colorScheme.copyWith(
          primary: neutral ? null : scheme.primary,
          onPrimary: neutral ? null : scheme.primaryForeground,
          surface: scheme.background,
          onSurface: scheme.foreground,
          onSurfaceVariant: scheme.mutedForeground,
          surfaceContainerLowest: scheme.card,
          surfaceContainerLow: scheme.card,
          surfaceContainer: scheme.muted,
          surfaceContainerHigh: scheme.muted,
          surfaceContainerHighest: scheme.border,
          outline: scheme.border,
          outlineVariant: scheme.border,
        ),
        dividerTheme: material.DividerThemeData(color: scheme.border),
      );
    });
  }

  /// The resolved shad colour scheme for a non-default appearance.
  static shad.ColorScheme colorScheme(
    AppearanceSettings settings,
    Brightness b,
  ) {
    final base =
        (b == Brightness.dark ? MobileShadTheme.dark : MobileShadTheme.light)
            .colorScheme;
    if (_usesBaseScheme(settings)) return base;
    final dark = b == Brightness.dark;
    final tones = AppearancePalettes.of(settings.theme).tones(b);
    final accent = AppearancePalettes.accentColor(settings, b);
    const white = Color(0xFFFFFFFF);
    Color mix(Color a, Color c, double t) => Color.lerp(a, c, t)!;
    final card = dark
        ? mix(tones.base, white, 0.05)
        : mix(tones.base, white, 0.7);
    final subtle = mix(tones.base, tones.foreground, dark ? 0.1 : 0.05);
    final line = mix(tones.base, tones.foreground, dark ? 0.16 : 0.12);
    return base.copyWith(
      background: () => tones.base,
      foreground: () => tones.foreground,
      card: () => card,
      cardForeground: () => tones.foreground,
      popover: () => card,
      popoverForeground: () => tones.foreground,
      primary: () => accent,
      primaryForeground: () => AppearanceContrast.readableOn(
        accent,
        light: AppColors.textPrimaryDark,
        dark: AppColors.textPrimaryLight,
      ),
      secondary: () => subtle,
      secondaryForeground: () => tones.foreground,
      muted: () => subtle,
      mutedForeground: () => tones.muted,
      accent: () => subtle,
      accentForeground: () => tones.foreground,
      border: () => line,
      input: () => line,
      ring: () => accent,
    );
  }

  /// Colour-affecting fields only; sliders and motion do not change the
  /// theme objects, which keeps theme identity stable while they move.
  static AppearanceSettings _colorKey(AppearanceSettings s) =>
      AppearanceSettings(
        theme: s.theme,
        accent: s.accent,
        backgroundStyle: s.backgroundStyle,
      );

  static T _remember<K, T>(Map<K, T> cache, K key, T Function() build) {
    final hit = cache[key];
    if (hit != null) return hit;
    if (cache.length > 16) cache.clear();
    return cache[key] = build();
  }
}
