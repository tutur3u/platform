import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';
import 'package:mobile/l10n/l10n.dart';

String assistantThemeLabel(AppLocalizations l10n, AppearanceThemeId theme) =>
    switch (theme) {
      AppearanceThemeId.classic => l10n.appearanceThemeClassic,
      AppearanceThemeId.aurora => l10n.appearanceThemeAurora,
      AppearanceThemeId.sunset => l10n.appearanceThemeSunset,
      AppearanceThemeId.ocean => l10n.appearanceThemeOcean,
      AppearanceThemeId.forest => l10n.appearanceThemeForest,
      AppearanceThemeId.ember => l10n.appearanceThemeEmber,
      AppearanceThemeId.blossom => l10n.appearanceThemeBlossom,
      AppearanceThemeId.mono => l10n.appearanceThemeMono,
    };

String assistantTextAccentLabel(
  AppLocalizations l10n,
  AppearanceAccentId accent,
) => switch (accent) {
  AppearanceAccentId.theme => l10n.appearanceAccentTheme,
  AppearanceAccentId.neutral => l10n.appearanceAccentNeutral,
  AppearanceAccentId.indigo => l10n.appearanceAccentIndigo,
  AppearanceAccentId.blue => l10n.appearanceAccentBlue,
  AppearanceAccentId.teal => l10n.appearanceAccentTeal,
  AppearanceAccentId.green => l10n.appearanceAccentGreen,
  AppearanceAccentId.amber => l10n.appearanceAccentAmber,
  AppearanceAccentId.orange => l10n.appearanceAccentOrange,
  AppearanceAccentId.rose => l10n.appearanceAccentRose,
  AppearanceAccentId.violet => l10n.appearanceAccentViolet,
};

String assistantBackgroundStyleLabel(
  AppLocalizations l10n,
  AssistantBackgroundStyle style,
) => switch (style) {
  AssistantBackgroundStyle.solid => l10n.appearanceBackgroundSolid,
  AssistantBackgroundStyle.gradient => l10n.appearanceBackgroundGradient,
  AssistantBackgroundStyle.ombre => l10n.assistantThemeOmbre,
};
