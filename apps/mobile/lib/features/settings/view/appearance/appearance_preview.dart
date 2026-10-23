import 'package:flutter/material.dart';
import 'package:mobile/core/theme/appearance/ambient_background.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Live light and dark previews of the current appearance. The app already
/// applies changes instantly; this shows how the other mode will look too.
class AppearancePreview extends StatelessWidget {
  const AppearancePreview({required this.settings, super.key});

  final AppearanceSettings settings;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final current = shad.Theme.of(context).brightness;
    return Semantics(
      container: true,
      label: l10n.appearancePreviewTitle,
      child: Row(
        children: [
          for (final brightness in const [Brightness.light, Brightness.dark])
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(
                  right: brightness == Brightness.light ? 6 : 0,
                  left: brightness == Brightness.dark ? 6 : 0,
                ),
                child: _PreviewPane(
                  key: ValueKey('appearance-preview-${brightness.name}'),
                  settings: settings,
                  brightness: brightness,
                  active: brightness == current,
                  title: brightness == Brightness.light
                      ? l10n.settingsThemeLight
                      : l10n.settingsThemeDark,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _PreviewPane extends StatelessWidget {
  const _PreviewPane({
    required this.settings,
    required this.brightness,
    required this.active,
    required this.title,
    super.key,
  });

  final AppearanceSettings settings;
  final Brightness brightness;
  final bool active;
  final String title;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final typography = shad.Theme.of(context).typography;
    final ring = shad.Theme.of(context).colorScheme.primary;
    final scheme = AppearanceTheme.colorScheme(settings, brightness);
    final card = settings.hasAmbientBackground
        ? scheme.card.withValues(alpha: settings.surfaceOpacity)
        : SettingsRowLayout.solidGroupFill(scheme);
    final radius = BorderRadius.circular(22);
    return DecoratedBox(
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
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: typography.large.copyWith(
                      fontWeight: FontWeight.w700,
                      color: scheme.foreground,
                    ),
                  ),
                  const shad.Gap(10),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: card,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                l10n.appearancePreviewRowTitle,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: typography.small.copyWith(
                                  fontWeight: FontWeight.w600,
                                  color: scheme.foreground,
                                ),
                              ),
                              Text(
                                l10n.appearancePreviewRowSubtitle,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: typography.xSmall.copyWith(
                                  color: scheme.mutedForeground,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const shad.Gap(6),
                        _MiniSwitch(track: scheme.primary, knob: card),
                      ],
                    ),
                  ),
                  const shad.Gap(10),
                  DecoratedBox(
                    decoration: ShapeDecoration(
                      color: scheme.primary,
                      shape: const StadiumBorder(),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      child: Text(
                        l10n.appearancePreviewAction,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: typography.xSmall.copyWith(
                          fontWeight: FontWeight.w600,
                          color: scheme.primaryForeground,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MiniSwitch extends StatelessWidget {
  const _MiniSwitch({required this.track, required this.knob});

  final Color track;
  final Color knob;

  @override
  Widget build(BuildContext context) => Container(
    width: 30,
    height: 18,
    padding: const EdgeInsets.all(2),
    alignment: Alignment.centerRight,
    decoration: ShapeDecoration(color: track, shape: const StadiumBorder()),
    child: DecoratedBox(
      decoration: BoxDecoration(
        color: knob.withValues(alpha: 1),
        shape: BoxShape.circle,
      ),
      child: const SizedBox.square(dimension: 14),
    ),
  );
}
