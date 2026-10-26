import 'package:flutter/material.dart';
import 'package:mobile/core/theme/appearance/ambient_background.dart';
import 'package:mobile/core/theme/appearance/appearance_palettes.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/appearance/appearance_labels.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/l10n/l10n.dart';

/// Visual gallery of curated background themes. Swatches always show the
/// theme's gradient or blobs at full intensity so dark themes stay distinct.
class AppearanceThemeGallery extends StatelessWidget {
  const AppearanceThemeGallery({
    required this.settings,
    required this.brightness,
    required this.onSelected,
    this.highlight,
    super.key,
  });

  final AppearanceSettings settings;
  final Brightness brightness;
  final ValueChanged<AppearanceThemeId> onSelected;

  /// Theme marked "New" on the first visit.
  final AppearanceThemeId? highlight;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 600 ? 4 : 2;
        const gap = 12.0;
        final width = (constraints.maxWidth - gap * (columns - 1)) / columns;
        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (final palette in AppearancePalettes.all)
              SizedBox(
                width: width,
                child: _ThemeTile(
                  id: palette.id,
                  label: l10n.appearanceTheme(palette.id),
                  badge: palette.id == highlight ? l10n.appearanceNew : null,
                  selected: palette.id == settings.theme,
                  swatch: settings.copyWith(
                    theme: palette.id,
                    intensity: 1,
                    softness: 0.45,
                    backgroundStyle:
                        palette.preferredStyle ==
                            AppearanceBackgroundStyle.blobs
                        ? AppearanceBackgroundStyle.blobs
                        : AppearanceBackgroundStyle.gradient,
                  ),
                  brightness: brightness,
                  onTap: () => onSelected(palette.id),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _ThemeTile extends StatelessWidget {
  const _ThemeTile({
    required this.id,
    required this.label,
    required this.selected,
    required this.swatch,
    required this.brightness,
    required this.onTap,
    this.badge,
  });

  final AppearanceThemeId id;
  final String label;
  final String? badge;
  final bool selected;
  final AppearanceSettings swatch;
  final Brightness brightness;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = AppTokens.of(context);
    final ring = theme.colorScheme.primary;
    final accent = AppearanceTheme.colorScheme(swatch, brightness).primary;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(20),
      side: BorderSide(
        color: selected ? ring : theme.colorScheme.border,
        width: selected ? 2 : 0.5,
      ),
    );
    return Semantics(
      button: true,
      selected: selected,
      label: badge == null ? label : '$label, $badge',
      // Excluded child semantics drop the InkWell tap action.
      onTap: onTap,
      excludeSemantics: true,
      child: Material(
        key: ValueKey('appearance-theme-${id.name}'),
        color: SettingsRowLayout.groupFill(context),
        shape: shape,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                height: 76,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    AmbientBackground(settings: swatch, brightness: brightness),
                    Align(
                      alignment: Alignment.bottomLeft,
                      child: Padding(
                        padding: const EdgeInsets.all(10),
                        child: CircleAvatar(radius: 7, backgroundColor: accent),
                      ),
                    ),
                    if (badge case final text?)
                      Align(
                        alignment: Alignment.topRight,
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: DecoratedBox(
                            decoration: ShapeDecoration(
                              color: ring,
                              shape: const StadiumBorder(),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 2,
                              ),
                              child: Text(
                                text,
                                style: theme.typography.xSmall.copyWith(
                                  fontWeight: FontWeight.w600,
                                  color: theme.colorScheme.primaryForeground,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.typography.small.copyWith(
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    if (selected)
                      Icon(LucideIcons.circleCheck, size: 18, color: ring),
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
