import 'package:flutter/material.dart';
import 'package:mobile/core/theme/appearance/ambient_background.dart';
import 'package:mobile/core/theme/appearance/appearance_palettes.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/features/settings/view/appearance/appearance_labels.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Duration _motion(BuildContext context) =>
    MediaQuery.disableAnimationsOf(context)
    ? Duration.zero
    : const Duration(milliseconds: 180);

/// Equal-width segmented choice with an accent-filled selection.
class AppearanceSegmented<T> extends StatelessWidget {
  const AppearanceSegmented({
    required this.values,
    required this.selected,
    required this.label,
    required this.icon,
    required this.onSelected,
    super.key,
  });

  final List<T> values;
  final T selected;
  final String Function(T) label;
  final IconData Function(T) icon;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) {
    final scheme = shad.Theme.of(context).colorScheme;
    final typography = shad.Theme.of(context).typography;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: ShapeDecoration(
        color: SettingsRowLayout.groupFill(context),
        shape: StadiumBorder(side: BorderSide(color: scheme.border, width: .5)),
      ),
      child: Row(
        children: [
          for (final value in values)
            Expanded(
              child: Semantics(
                button: true,
                selected: value == selected,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onSelected(value),
                  child: AnimatedContainer(
                    duration: _motion(context),
                    curve: Curves.easeOutCubic,
                    constraints: const BoxConstraints(minHeight: 44),
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    decoration: ShapeDecoration(
                      color: value == selected
                          ? scheme.primary
                          : scheme.primary.withValues(alpha: 0),
                      shape: const StadiumBorder(),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          icon(value),
                          size: 18,
                          color: value == selected
                              ? scheme.primaryForeground
                              : scheme.foreground,
                        ),
                        const shad.Gap(6),
                        Flexible(
                          child: Text(
                            label(value),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: typography.small.copyWith(
                              fontWeight: FontWeight.w600,
                              color: value == selected
                                  ? scheme.primaryForeground
                                  : scheme.foreground,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Visual gallery of curated background themes.
class AppearanceThemeGallery extends StatelessWidget {
  const AppearanceThemeGallery({
    required this.settings,
    required this.brightness,
    required this.onSelected,
    super.key,
  });

  final AppearanceSettings settings;
  final Brightness brightness;
  final ValueChanged<AppearanceThemeId> onSelected;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final scheme = shad.Theme.of(context).colorScheme;
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
                  palette: palette,
                  label: l10n.appearanceTheme(palette.id),
                  selected: palette.id == settings.theme,
                  preview: settings.copyWith(
                    theme: palette.id,
                    backgroundStyle: palette.id == settings.theme
                        ? settings.backgroundStyle
                        : palette.preferredStyle,
                  ),
                  brightness: brightness,
                  ring: scheme.primary,
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
    required this.palette,
    required this.label,
    required this.selected,
    required this.preview,
    required this.brightness,
    required this.ring,
    required this.onTap,
  });

  final AppearancePalette palette;
  final String label;
  final bool selected;
  final AppearanceSettings preview;
  final Brightness brightness;
  final Color ring;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final accent = AppearancePalettes.accentColor(preview, brightness);
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
      label: label,
      excludeSemantics: true,
      child: Material(
        key: ValueKey('appearance-theme-${palette.id.name}'),
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
                    AmbientBackground(
                      settings: preview,
                      brightness: brightness,
                    ),
                    Align(
                      alignment: Alignment.bottomLeft,
                      child: Padding(
                        padding: const EdgeInsets.all(10),
                        child: CircleAvatar(radius: 7, backgroundColor: accent),
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
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (selected)
                      Icon(Icons.check_circle_rounded, size: 18, color: ring),
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
