import 'package:flutter/material.dart' as material;
import 'package:flutter/widgets.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/theme/colors.dart';
import 'package:mobile/core/theme/sorbet/sorbet_palettes.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
import 'package:mobile/core/ui/tokens/app_color_tokens.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';

/// Derives the colour roles and Material theme of the Sorbet design; the
/// shad theme is built from the same roles by `AppearanceTheme.shadThemeFor`.
///
/// Roles come from `SorbetPalettes.roles` (the `sorbet-tokens.json` roles
/// for the default palette, the `sorbet-presets.css` mapping for presets):
/// cards and popovers take the surface, secondary and muted the sunken
/// surface, and inputs the strong border.
abstract final class SorbetAppTheme {
  static final _materialCache =
      <(SorbetTheme, Brightness), material.ThemeData>{};

  /// shad radius multiplier: controls at 12 (soft), 6 (sharp) or 16 (round).
  static double radiusScale(SorbetRadius radius) => switch (radius) {
    SorbetRadius.soft => 1,
    SorbetRadius.sharp => 0.5,
    SorbetRadius.round => 4 / 3,
  };

  /// The bundled family for [font], or null for the platform default. Nunito
  /// falls back to Noto Sans until the Nunito font ships with the app.
  static String? fontFamily(SorbetFont font) => switch (font) {
    SorbetFont.nunito || SorbetFont.noto => 'NotoSans',
    SorbetFont.system => null,
  };

  /// A custom accent lifted to AA text contrast on every Sorbet surface, the
  /// same way the classic path lifts its accents.
  static Color? _customAccent(SorbetTheme theme, Brightness b) {
    final hex = theme.accent;
    if (hex == null) return null;
    final roles = SorbetPalettes.roles(theme.preset, b);
    final worst = AppearanceContrast.channelBound([
      roles.ground,
      roles.background,
      roles.surface,
      roles.surfaceSunken,
    ], lightest: b == Brightness.dark);
    return AppearanceContrast.ensureContrast(
      Color(0xFF000000 | int.parse(hex.substring(1), radix: 16)),
      against: worst,
      target: AppearanceContrast.aaText,
    );
  }

  /// The resolved roles. A custom accent replaces primary and ring, with a
  /// near-white or near-black label, whichever reads better.
  static AppColorTokens colorTokens(SorbetTheme theme, Brightness b) {
    final roles = SorbetPalettes.roles(theme.preset, b);
    final hues = SorbetPalettes.hues(theme.preset, b);
    final custom = _customAccent(theme, b);
    return AppColorTokens(
      brightness: b,
      background: roles.background,
      foreground: roles.foreground,
      card: roles.surface,
      cardForeground: roles.foreground,
      popover: roles.surface,
      popoverForeground: roles.foreground,
      primary: custom ?? roles.primary,
      primaryForeground: custom == null
          ? roles.primaryForeground
          : AppearanceContrast.readableOn(
              custom,
              light: AppColors.textPrimaryDark,
              dark: AppColors.textPrimaryLight,
            ),
      secondary: roles.surfaceSunken,
      secondaryForeground: roles.foreground,
      muted: roles.surfaceSunken,
      mutedForeground: roles.mutedForeground,
      accent: roles.accent,
      accentForeground: roles.foreground,
      destructive: roles.destructive,
      destructiveForeground: roles.destructiveForeground,
      border: roles.border,
      input: roles.borderStrong,
      ring: custom ?? roles.ring,
      success: hues.green.ink,
      warning: hues.yellow.ink,
      info: hues.blue.ink,
    );
  }

  /// [base] with the Sorbet density and corner options; the navigation
  /// style stays the classic choice.
  static AppInterfaceTokens interfaceTokens(
    SorbetTheme theme,
    AppInterfaceTokens base,
  ) => base.copyWith(
    density: theme.density == SorbetDensity.compact
        ? AppDensity.compact
        : AppDensity.comfortable,
    corners: theme.radius == SorbetRadius.sharp
        ? AppCornerStyle.soft
        : AppCornerStyle.rounded,
  );

  static material.ThemeData materialTheme(SorbetTheme theme, Brightness b) =>
      _remember(_materialCache, (theme, b), () => _material(theme, b));

  static material.ThemeData _material(SorbetTheme theme, Brightness b) {
    final base = b == Brightness.dark ? AppTheme.dark : AppTheme.light;
    final scheme = colorTokens(theme, b);
    final roles = SorbetPalettes.roles(theme.preset, b);
    final radii = SorbetRadii.of(theme.radius);
    final colors = base.colorScheme.copyWith(
      primary: scheme.primary,
      onPrimary: scheme.primaryForeground,
      primaryContainer: roles.accent,
      onPrimaryContainer: roles.foreground,
      secondary: scheme.primary,
      onSecondary: scheme.primaryForeground,
      secondaryContainer: roles.accent,
      onSecondaryContainer: roles.foreground,
      tertiary: scheme.primary,
      onTertiary: scheme.primaryForeground,
      tertiaryContainer: roles.accent,
      onTertiaryContainer: roles.foreground,
      surface: roles.background,
      onSurface: roles.foreground,
      onSurfaceVariant: roles.mutedForeground,
      error: roles.destructive,
      onError: roles.destructiveForeground,
      surfaceContainerLowest: roles.surface,
      surfaceContainerLow: roles.surfaceSunken,
      surfaceContainer: roles.surfaceSunken,
      surfaceContainerHigh: roles.surfaceSunken,
      surfaceContainerHighest: roles.border,
      outline: roles.border,
      outlineVariant: roles.borderStrong,
      scrim: roles.scrim,
      inverseSurface: roles.foreground,
      onInverseSurface: roles.background,
      inversePrimary: roles.background,
    );
    const pill = WidgetStatePropertyAll<OutlinedBorder>(StadiumBorder());
    final field = material.OutlineInputBorder(
      borderRadius: BorderRadius.circular(radii.control),
      borderSide: BorderSide(color: roles.borderStrong),
    );
    return base.copyWith(
      scaffoldBackgroundColor: roles.ground,
      colorScheme: colors,
      textTheme: _textTheme(base.textTheme, fontFamily(theme.font)),
      dividerTheme: material.DividerThemeData(color: roles.border),
      appBarTheme: base.appBarTheme.copyWith(
        backgroundColor: roles.ground,
        foregroundColor: roles.foreground,
      ),
      // Selected states use the accent and foreground until the tokens
      // define dock and navigation fills.
      navigationBarTheme: base.navigationBarTheme.copyWith(
        backgroundColor: roles.surface,
        indicatorColor: roles.accent,
      ),
      snackBarTheme: base.snackBarTheme.copyWith(
        backgroundColor: roles.foreground,
        contentTextStyle: TextStyle(color: roles.background),
        actionTextColor: roles.background,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radii.card),
        ),
      ),
      filledButtonTheme: const material.FilledButtonThemeData(
        style: material.ButtonStyle(shape: pill),
      ),
      outlinedButtonTheme: const material.OutlinedButtonThemeData(
        style: material.ButtonStyle(shape: pill),
      ),
      elevatedButtonTheme: const material.ElevatedButtonThemeData(
        style: material.ButtonStyle(shape: pill),
      ),
      textButtonTheme: const material.TextButtonThemeData(
        style: material.ButtonStyle(shape: pill),
      ),
      inputDecorationTheme: material.InputDecorationTheme(
        border: field,
        enabledBorder: field,
        focusedBorder: field.copyWith(
          borderSide: BorderSide(color: scheme.ring, width: 2),
        ),
      ),
      extensions: [
        colorTokens(theme, b),
        SorbetTokens.resolve(theme, b, ring: scheme.ring),
      ],
    );
  }

  /// The listed roles keep their sizes and take the Sorbet family.
  static material.TextTheme _textTheme(
    material.TextTheme base,
    String? family,
  ) {
    if (family == null) return base;
    TextStyle? withFamily(TextStyle? style) =>
        style?.copyWith(fontFamily: family);
    return base.copyWith(
      titleLarge: withFamily(base.titleLarge),
      titleMedium: withFamily(base.titleMedium),
      bodyLarge: withFamily(base.bodyLarge),
      bodyMedium: withFamily(base.bodyMedium),
      bodySmall: withFamily(base.bodySmall),
      labelLarge: withFamily(base.labelLarge),
      labelMedium: withFamily(base.labelMedium),
      labelSmall: withFamily(base.labelSmall),
    );
  }

  static T _remember<K, T>(Map<K, T> cache, K key, T Function() build) {
    final hit = cache[key];
    if (hit != null) return hit;
    if (cache.length > 16) cache.clear();
    return cache[key] = build();
  }
}
