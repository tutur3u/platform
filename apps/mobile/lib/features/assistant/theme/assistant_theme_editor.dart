import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/theme/appearance/appearance_palettes.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/ui/components/app_disclosure.dart';
import 'package:mobile/core/ui/components/app_list_tile.dart';
import 'package:mobile/core/ui/components/app_select.dart';
import 'package:mobile/core/ui/components/app_slider.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_labels.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preview.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantThemeEditor extends StatelessWidget {
  const AssistantThemeEditor({
    required this.value,
    required this.onChanged,
    super.key,
  });

  final AssistantThemePreferences value;
  final ValueChanged<AssistantThemePreferences>? onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final themes = AppearancePalettes.all.map((palette) => palette.id).toList();
    final preset = themes
        .where((theme) => AssistantThemePreferences.preset(theme) == value)
        .firstOrNull;
    final themeOptions = [
      for (final theme in themes)
        AppSelectOption(value: theme, label: assistantThemeLabel(l10n, theme)),
    ];
    Widget field(String label, Widget control) => Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppListTile(title: Text(label), contentPadding: EdgeInsets.zero),
          control,
        ],
      ),
    );
    void change(AssistantThemePreferences next) => onChanged?.call(next);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AssistantThemePreview(value: value),
        const SizedBox(height: AppSpacing.md),
        field(
          l10n.assistantThemePreset,
          AppSelect<AppearanceThemeId>(
            key: const ValueKey('assistant-theme-preset'),
            title: l10n.assistantThemePreset,
            placeholder: l10n.assistantThemeCustom,
            options: themeOptions,
            value: preset,
            onChanged: onChanged == null
                ? null
                : (theme) => change(AssistantThemePreferences.preset(theme)),
          ),
        ),
        AppDisclosure(
          key: const ValueKey('assistant-theme-advanced'),
          title: Text(l10n.assistantThemeAdvanced),
          children: [
            field(
              l10n.assistantThemeMessages,
              AppSelect<AppearanceThemeId>(
                key: const ValueKey('assistant-theme-messages'),
                title: l10n.assistantThemeMessages,
                options: themeOptions,
                value: value.messageTheme,
                onChanged: onChanged == null
                    ? null
                    : (theme) => change(value.copyWith(messageTheme: theme)),
              ),
            ),
            field(
              l10n.assistantThemeText,
              AppSelect<AppearanceAccentId>(
                key: const ValueKey('assistant-theme-text'),
                title: l10n.assistantThemeText,
                options: [
                  for (final accent in AppearanceAccentId.values)
                    AppSelectOption(
                      value: accent,
                      label: assistantTextAccentLabel(l10n, accent),
                    ),
                ],
                value: value.textAccent,
                onChanged: onChanged == null
                    ? null
                    : (accent) => change(value.copyWith(textAccent: accent)),
              ),
            ),
            field(
              l10n.assistantThemeBackground,
              AppSelect<AppearanceThemeId>(
                key: const ValueKey('assistant-theme-background'),
                title: l10n.assistantThemeBackground,
                options: themeOptions,
                value: value.backgroundTheme,
                onChanged: onChanged == null
                    ? null
                    : (theme) => change(value.copyWith(backgroundTheme: theme)),
              ),
            ),
            field(
              l10n.assistantThemeBackgroundStyle,
              AppSelect<AssistantBackgroundStyle>(
                key: const ValueKey('assistant-theme-background-style'),
                title: l10n.assistantThemeBackgroundStyle,
                options: [
                  for (final style in AssistantBackgroundStyle.values)
                    AppSelectOption(
                      value: style,
                      label: assistantBackgroundStyleLabel(l10n, style),
                    ),
                ],
                value: value.backgroundStyle,
                onChanged: onChanged == null
                    ? null
                    : (style) => change(value.copyWith(backgroundStyle: style)),
              ),
            ),
            if (value.backgroundStyle != AssistantBackgroundStyle.solid)
              field(
                l10n.assistantThemeIntensity,
                AppSlider(
                  key: const ValueKey('assistant-theme-intensity'),
                  label: l10n.assistantThemeIntensity,
                  value: value.intensity,
                  divisions: 10,
                  onChanged: onChanged == null
                      ? null
                      : (intensity) =>
                            change(value.copyWith(intensity: intensity)),
                ),
              ),
          ],
        ),
      ],
    );
  }
}
