import 'package:flutter/material.dart' as material;
import 'package:flutter/widgets.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/theme/appearance/appearance_palettes.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/colors.dart';
import 'package:mobile/core/theme/mobile_shad_theme.dart';
import 'package:mobile/core/ui/tokens/app_color_tokens.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Derives app-wide shad and Material themes from [AppearanceSettings].
///
/// Classic dark with the neutral accent and a solid background returns the
/// original [MobileShadTheme] and [AppTheme] instances. Every other choice,
/// including the default Classic light (an iOS-style grouped page with white
/// cards), derives a scheme whose text and role colours meet WCAG AA against
/// the theme's worst-case background blend.
abstract final class AppearanceTheme {
  static final _shadCache =
      <(AppearanceSettings, Brightness), shad.ThemeData>{};
  static final _materialCache =
      <(AppearanceSettings, Brightness), material.ThemeData>{};

  static bool _usesBaseScheme(AppearanceSettings settings, Brightness b) =>
      b == Brightness.dark &&
      settings.theme == AppearanceThemeId.classic &&
      !settings.hasAmbientBackground &&
      AppearancePalettes.effectiveAccentId(settings) ==
          AppearanceAccentId.neutral;

  static shad.ThemeData shadTheme(AppearanceSettings settings, Brightness b) {
    final base = b == Brightness.dark
        ? MobileShadTheme.dark
        : MobileShadTheme.light;
    if (_usesBaseScheme(settings, b)) return base;
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
    if (_usesBaseScheme(settings, b)) return base;
    final key = (_colorKey(settings), b);
    return _remember(_materialCache, key, () {
      final scheme = colorScheme(settings, b);
      final page = settings.hasAmbientBackground
          ? const Color(0x00000000)
          : scheme.background;
      final neutral =
          AppearancePalettes.effectiveAccentId(settings) ==
          AppearanceAccentId.neutral;
      Color tint(double t) => Color.lerp(scheme.background, scheme.primary, t)!;
      // Chips, FABs, indicators and tinted surfaces follow the accent.
      final accentRoles = neutral
          ? base.colorScheme
          : base.colorScheme.copyWith(
              primary: scheme.primary,
              onPrimary: scheme.primaryForeground,
              primaryContainer: tint(0.18),
              onPrimaryContainer: scheme.foreground,
              secondary: scheme.primary,
              onSecondary: scheme.primaryForeground,
              secondaryContainer: tint(0.12),
              onSecondaryContainer: scheme.foreground,
              tertiary: scheme.primary,
              onTertiary: scheme.primaryForeground,
              tertiaryContainer: tint(0.12),
              onTertiaryContainer: scheme.foreground,
              surfaceTint: scheme.primary,
            );
      return base.copyWith(
        scaffoldBackgroundColor: page,
        colorScheme: accentRoles.copyWith(
          surface: scheme.background,
          onSurface: scheme.foreground,
          onSurfaceVariant: scheme.mutedForeground,
          error: scheme.destructive,
          onError: labelOn(scheme.destructive),
          surfaceContainerLowest: scheme.card,
          surfaceContainerLow: scheme.card,
          surfaceContainer: scheme.muted,
          surfaceContainerHigh: scheme.muted,
          surfaceContainerHighest: scheme.border,
          outline: scheme.border,
          outlineVariant: scheme.border,
        ),
        dividerTheme: material.DividerThemeData(color: scheme.border),
        extensions: [colorTokens(scheme, b)],
      );
    });
  }

  /// The resolved shad colour scheme for an appearance.
  static shad.ColorScheme colorScheme(
    AppearanceSettings settings,
    Brightness b,
  ) {
    final base =
        (b == Brightness.dark ? MobileShadTheme.dark : MobileShadTheme.light)
            .colorScheme;
    if (_usesBaseScheme(settings, b)) return base;
    final dark = b == Brightness.dark;
    final tones = AppearancePalettes.of(settings.theme).tones(b);
    const white = Color(0xFFFFFFFF);
    Color mix(Color a, Color c, double t) => Color.lerp(a, c, t)!;
    // Light cards are white over a tinted page; dark cards lift the page.
    final card = dark ? mix(tones.base, white, 0.08) : white;
    final subtle = mix(tones.base, tones.foreground, dark ? 0.1 : 0.05);
    final line = mix(tones.base, tones.foreground, dark ? 0.16 : 0.12);
    // Text may sit on any blend of these; the channel bound covers them all.
    final worst = AppearanceContrast.channelBound([
      tones.base,
      ...tones.gradient,
      ...tones.blobs,
      card,
      subtle,
    ], lightest: dark);
    Color readable(Color color) => AppearanceContrast.ensureContrast(
      color,
      against: worst,
      target: AppearanceContrast.aaText,
    );
    final accent = readable(AppearancePalettes.accentColor(settings, b));
    final destructive = readable(base.destructive);
    return base.copyWith(
      background: () => tones.base,
      foreground: () => tones.foreground,
      card: () => card,
      cardForeground: () => tones.foreground,
      popover: () => card,
      popoverForeground: () => tones.foreground,
      primary: () => accent,
      primaryForeground: () => labelOn(accent),
      secondary: () => subtle,
      secondaryForeground: () => tones.foreground,
      muted: () => subtle,
      mutedForeground: () => tones.muted,
      accent: () => subtle,
      accentForeground: () => tones.foreground,
      destructive: () => destructive,
      border: () => line,
      input: () => line,
      ring: () => accent,
    );
  }

  /// Design-system roles for a resolved scheme. Status hues keep the Classic
  /// values and are lifted to AA against the scheme background.
  static AppColorTokens colorTokens(shad.ColorScheme scheme, Brightness b) {
    final status = AppColorTokens.fallback(b);
    Color readable(Color color) => AppearanceContrast.ensureContrast(
      color,
      against: scheme.background,
      target: AppearanceContrast.aaText,
    );
    return AppColorTokens(
      brightness: b,
      background: scheme.background,
      foreground: scheme.foreground,
      card: scheme.card,
      cardForeground: scheme.cardForeground,
      popover: scheme.popover,
      popoverForeground: scheme.popoverForeground,
      primary: scheme.primary,
      primaryForeground: scheme.primaryForeground,
      secondary: scheme.secondary,
      secondaryForeground: scheme.secondaryForeground,
      muted: scheme.muted,
      mutedForeground: scheme.mutedForeground,
      accent: scheme.accent,
      accentForeground: scheme.accentForeground,
      destructive: scheme.destructive,
      destructiveForeground: labelOn(scheme.destructive),
      border: scheme.border,
      input: scheme.input,
      ring: scheme.ring,
      success: readable(status.success),
      warning: readable(status.warning),
      info: readable(status.info),
    );
  }

  /// Near-white or near-black label, whichever reads better on [fill].
  static Color labelOn(Color fill) => AppearanceContrast.readableOn(
    fill,
    light: AppColors.textPrimaryDark,
    dark: AppColors.textPrimaryLight,
  );

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
