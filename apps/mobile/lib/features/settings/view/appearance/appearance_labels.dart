import 'package:flutter/material.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/l10n/l10n.dart';

/// Localised names for appearance options.
extension AppearanceLabels on AppLocalizations {
  String appearanceTheme(AppearanceThemeId id) => switch (id) {
    AppearanceThemeId.classic => appearanceThemeClassic,
    AppearanceThemeId.aurora => appearanceThemeAurora,
    AppearanceThemeId.sunset => appearanceThemeSunset,
    AppearanceThemeId.ocean => appearanceThemeOcean,
    AppearanceThemeId.forest => appearanceThemeForest,
    AppearanceThemeId.ember => appearanceThemeEmber,
    AppearanceThemeId.blossom => appearanceThemeBlossom,
    AppearanceThemeId.mono => appearanceThemeMono,
  };

  String appearanceAccent(AppearanceAccentId id) => switch (id) {
    AppearanceAccentId.theme => appearanceAccentTheme,
    AppearanceAccentId.neutral => appearanceAccentNeutral,
    AppearanceAccentId.indigo => appearanceAccentIndigo,
    AppearanceAccentId.blue => appearanceAccentBlue,
    AppearanceAccentId.teal => appearanceAccentTeal,
    AppearanceAccentId.green => appearanceAccentGreen,
    AppearanceAccentId.amber => appearanceAccentAmber,
    AppearanceAccentId.orange => appearanceAccentOrange,
    AppearanceAccentId.rose => appearanceAccentRose,
    AppearanceAccentId.violet => appearanceAccentViolet,
  };

  String appearanceBackground(AppearanceBackgroundStyle style) =>
      switch (style) {
        AppearanceBackgroundStyle.solid => appearanceBackgroundSolid,
        AppearanceBackgroundStyle.gradient => appearanceBackgroundGradient,
        AppearanceBackgroundStyle.blobs => appearanceBackgroundBlobs,
      };

  String appearanceMode(ThemeMode mode) => switch (mode) {
    ThemeMode.system => settingsThemeSystem,
    ThemeMode.light => settingsThemeLight,
    ThemeMode.dark => settingsThemeDark,
  };

  String appearanceStyle(AppInterfaceStyle style) => switch (style) {
    AppInterfaceStyle.tuturuuu => appearanceStyleTuturuuu,
    AppInterfaceStyle.ios => appearanceStyleIos,
    AppInterfaceStyle.material => appearanceStyleMaterial,
  };

  String appearanceDensity(AppDensity density) => switch (density) {
    AppDensity.comfortable => appearanceDensityComfortable,
    AppDensity.compact => appearanceDensityCompact,
  };

  String appearanceCorners(AppCornerStyle corners) => switch (corners) {
    AppCornerStyle.rounded => appearanceCornersRounded,
    AppCornerStyle.soft => appearanceCornersSoft,
    AppCornerStyle.square => appearanceCornersSquare,
  };
}
