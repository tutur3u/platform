import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/appearance/appearance_labels.dart';
import 'package:mobile/l10n/l10n.dart';

class AppearanceTextSection extends StatelessWidget {
  const AppearanceTextSection({
    required this.settings,
    required this.sorbet,
    required this.onFontChanged,
    required this.onScaleChanged,
    super.key,
  });

  final AppearanceSettings settings;
  final SorbetTheme? sorbet;
  final ValueChanged<AppTextFont> onFontChanged;
  final ValueChanged<double> onScaleChanged;

  Future<void> _chooseFont(BuildContext context) async {
    final interfaceFamily = AppearanceTheme.interfaceFontFamily(sorbet);
    final choice = await showAppSheet<AppTextFont>(
      context: context,
      builder: (context) {
        final l10n = context.l10n;
        final tokens = AppTokens.of(context);
        return AppSheetScaffold(
          title: l10n.appearanceTextFontTitle,
          child: AppGroupedCard(
            dividerInset: AppLayout.rowHorizontalPadding,
            children: [
              for (final font in AppTextFont.values)
                Semantics(
                  selected: font == settings.textFont,
                  child: AppGroupedRow(
                    title: Text(
                      l10n.appearanceTextFont(font),
                      style: TextStyle(
                        inherit: false,
                        color: tokens.colorScheme.foreground,
                        fontFamily: font.resolveFamily(interfaceFamily),
                        fontSize: tokens.typography.base.fontSize,
                      ),
                    ),
                    trailing: font == settings.textFont
                        ? Icon(
                            LucideIcons.check,
                            color: tokens.colorScheme.primary,
                          )
                        : null,
                    onTap: () => Navigator.of(context).pop(font),
                  ),
                ),
            ],
          ),
        );
      },
    );
    if (context.mounted && choice != null) onFontChanged(choice);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final scale = settings.textScale;
    final percent = NumberFormat.percentPattern(l10n.localeName).format(scale);

    void step(int delta) {
      final next = ((scale * 100).round() + delta) / 100;
      onScaleChanged(
        next.clamp(
          AppearanceSettings.minTextScale,
          AppearanceSettings.maxTextScale,
        ),
      );
    }

    return AppGroupedCard(
      dividerInset: AppLayout.rowHorizontalPadding,
      children: [
        AppGroupedRow(
          title: Text(l10n.appearanceTextFontTitle),
          subtitle: Text(l10n.appearanceTextFont(settings.textFont)),
          showChevron: true,
          onTap: () => _chooseFont(context),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppLayout.rowHorizontalPadding,
            vertical: AppSpacing.md,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l10n.appearanceTextSizeTitle, style: tokens.typography.ui),
              Wrap(
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  AppIconButton(
                    tooltip: l10n.appearanceTextSizeDecrease,
                    icon: const Icon(LucideIcons.minus),
                    onPressed: scale > AppearanceSettings.minTextScale
                        ? () => step(-5)
                        : null,
                  ),
                  Text(percent, style: tokens.typography.ui),
                  AppIconButton(
                    tooltip: l10n.appearanceTextSizeIncrease,
                    icon: const Icon(LucideIcons.plus),
                    onPressed: scale < AppearanceSettings.maxTextScale
                        ? () => step(5)
                        : null,
                  ),
                  AppButton.ghost(
                    onPressed: scale == AppearanceSettings.defaultTextScale
                        ? null
                        : () => onScaleChanged(
                            AppearanceSettings.defaultTextScale,
                          ),
                    child: Text(l10n.appearanceTextSizeReset),
                  ),
                ],
              ),
              Text(
                l10n.appearanceTextSample,
                style: tokens.typography.body.copyWith(
                  color: tokens.colorScheme.mutedForeground,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
