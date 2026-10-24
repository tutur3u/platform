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
                        child: _PreviewRow(
                          title: l10n.settingsAppearance,
                          value: theme,
                          foreground: scheme.foreground,
                          muted: scheme.mutedForeground,
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

/// The real Appearance row: the value sits flush right at its natural width
/// while the title fits on one line, and moves under the title otherwise.
class _PreviewRow extends StatelessWidget {
  const _PreviewRow({
    required this.title,
    required this.value,
    required this.foreground,
    required this.muted,
  });

  final String title;
  final String value;
  final Color foreground;
  final Color muted;

  @override
  Widget build(BuildContext context) {
    final typography = shad.Theme.of(context).typography;
    final titleStyle = typography.base.copyWith(
      fontWeight: FontWeight.w500,
      color: foreground,
    );
    final valueStyle = typography.base.copyWith(color: muted);
    final icon = Icon(shad.LucideIcons.palette, size: 20, color: foreground);
    final chevron = Icon(shad.LucideIcons.chevronRight, size: 17, color: muted);
    return LayoutBuilder(
      builder: (context, constraints) {
        double width(String text, TextStyle style) =>
            SettingsRowLayout.textWidth(context, text, style);
        final inline =
            constraints.maxWidth -
                20 -
                12 -
                8 -
                4 -
                17 -
                width(value, valueStyle) >=
            width(title, titleStyle);
        return Row(
          children: [
            icon,
            const shad.Gap(12),
            Expanded(
              child: inline
                  ? Text(title, style: titleStyle)
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: titleStyle),
                        Text(
                          value,
                          style: typography.small.copyWith(color: muted),
                        ),
                      ],
                    ),
            ),
            if (inline) ...[
              const shad.Gap(8),
              Text(value, maxLines: 1, style: valueStyle),
            ],
            const shad.Gap(4),
            chevron,
          ],
        );
      },
    );
  }
}
