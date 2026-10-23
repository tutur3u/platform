import 'package:flutter/material.dart';
import 'package:mobile/core/theme/appearance/ambient_background.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/features/settings/view/appearance/appearance_labels.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Live light and dark previews: the real Appearance row as it will render
/// in each mode. Long or enlarged labels wrap instead of truncating.
class AppearancePreview extends StatelessWidget {
  const AppearancePreview({required this.settings, super.key});

  final AppearanceSettings settings;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final current = shad.Theme.of(context).brightness;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final brightness in const [Brightness.light, Brightness.dark]) ...[
          if (brightness == Brightness.dark) const shad.Gap(10),
          _PreviewPane(
            key: ValueKey('appearance-preview-${brightness.name}'),
            settings: settings,
            brightness: brightness,
            active: brightness == current,
            mode: brightness == Brightness.light
                ? l10n.settingsThemeLight
                : l10n.settingsThemeDark,
          ),
        ],
      ],
    );
  }
}

class _PreviewPane extends StatelessWidget {
  const _PreviewPane({
    required this.settings,
    required this.brightness,
    required this.active,
    required this.mode,
    super.key,
  });

  final AppearanceSettings settings;
  final Brightness brightness;
  final bool active;
  final String mode;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final typography = shad.Theme.of(context).typography;
    final ring = shad.Theme.of(context).colorScheme.primary;
    final scheme = AppearanceTheme.colorScheme(settings, brightness);
    final card = settings.hasAmbientBackground
        ? scheme.card.withValues(alpha: settings.surfaceOpacity)
        : SettingsRowLayout.solidGroupFill(scheme);
    final radius = BorderRadius.circular(SettingsRowLayout.cardRadius);
    final theme = l10n.appearanceTheme(settings.theme);
    return Semantics(
      container: true,
      label: '$mode: ${l10n.settingsAppearance}, $theme',
      excludeSemantics: true,
      child: DecoratedBox(
        position: DecorationPosition.foreground,
        decoration: BoxDecoration(
          borderRadius: radius,
          border: Border.all(
            color: active ? ring : scheme.border,
            width: active ? 2 : 0.5,
          ),
        ),
        child: ClipRRect(
          borderRadius: radius,
          child: Stack(
            children: [
              Positioned.fill(
                child: AmbientBackground(
                  settings: settings,
                  brightness: brightness,
                  motion: AppearanceScope.maybeOf(context)?.motion,
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      mode,
                      style: typography.small.copyWith(
                        fontWeight: FontWeight.w500,
                        color: scheme.mutedForeground,
                      ),
                    ),
                    const shad.Gap(8),
                    DecoratedBox(
                      decoration: BoxDecoration(
                        color: card,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
                        ),
                        child: Row(
                          children: [
                            Icon(
                              shad.LucideIcons.palette,
                              size: 20,
                              color: scheme.foreground,
                            ),
                            const shad.Gap(12),
                            Expanded(
                              child: Text(
                                l10n.settingsAppearance,
                                style: typography.base.copyWith(
                                  fontWeight: FontWeight.w500,
                                  color: scheme.foreground,
                                ),
                              ),
                            ),
                            const shad.Gap(8),
                            Flexible(
                              child: Text(
                                theme,
                                textAlign: TextAlign.end,
                                style: typography.base.copyWith(
                                  color: scheme.mutedForeground,
                                ),
                              ),
                            ),
                            const shad.Gap(4),
                            Icon(
                              shad.LucideIcons.chevronRight,
                              size: 17,
                              color: scheme.mutedForeground,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
