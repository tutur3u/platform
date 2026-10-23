import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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

  String appearanceMode(shad.ThemeMode mode) => switch (mode) {
    shad.ThemeMode.system => settingsThemeSystem,
    shad.ThemeMode.light => settingsThemeLight,
    shad.ThemeMode.dark => settingsThemeDark,
  };

  /// Row summary such as "Dark · Blobs".
  String appearanceSummary(shad.ThemeMode mode, AppearanceSettings settings) =>
      '${appearanceMode(mode)} · '
      '${appearanceBackground(settings.backgroundStyle)}';
}
