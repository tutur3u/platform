import 'package:flutter/material.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/theme/colors.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/settings/view/appearance/appearance_labels.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Circular accent swatches; the first follows the selected theme.
class AppearanceAccentPicker extends StatelessWidget {
  const AppearanceAccentPicker({
    required this.settings,
    required this.brightness,
    required this.onSelected,
    super.key,
  });

  final AppearanceSettings settings;
  final Brightness brightness;
  final ValueChanged<AppearanceAccentId> onSelected;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final scheme = shad.Theme.of(context).colorScheme;
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        for (final id in AppearanceAccentId.values)
          Tooltip(
            message: l10n.appearanceAccent(id),
            child: Semantics(
              button: true,
              selected: id == settings.accent,
              label: l10n.appearanceAccent(id),
              // Excluded child semantics drop the InkResponse tap action.
              onTap: () => onSelected(id),
              excludeSemantics: true,
              child: InkResponse(
                key: ValueKey('appearance-accent-${id.name}'),
                radius: 26,
                onTap: () => onSelected(id),
                child: AnimatedContainer(
                  duration: MediaQuery.disableAnimationsOf(context)
                      ? Duration.zero
                      : const Duration(milliseconds: 180),
                  width: 44,
                  height: 44,
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: id == settings.accent
                          ? scheme.foreground
                          : scheme.foreground.withValues(alpha: 0),
                      width: 2,
                    ),
                  ),
                  child: _AccentDot(
                    color: AppearanceTheme.colorScheme(
                      settings.copyWith(accent: id),
                      brightness,
                    ).primary,
                    followsTheme: id == AppearanceAccentId.theme,
                    border: scheme.border,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _AccentDot extends StatelessWidget {
  const _AccentDot({
    required this.color,
    required this.followsTheme,
    required this.border,
  });

  final Color color;
  final bool followsTheme;
  final Color border;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: border, width: 0.5),
      ),
      child: followsTheme
          ? Icon(
              LucideIcons.sparkles,
              size: 16,
              color: AppearanceContrast.readableOn(
                color,
                light: AppColors.textPrimaryDark,
                dark: AppColors.textPrimaryLight,
              ),
            )
          : null,
    );
  }
}
