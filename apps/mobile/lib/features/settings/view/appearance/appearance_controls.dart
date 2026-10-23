import 'package:flutter/material.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Fine-tuning for ambient backgrounds: strength, softness, card opacity and
/// opt-in motion. Sliders preview live and persist when the drag ends.
class AppearanceAdjustments extends StatelessWidget {
  const AppearanceAdjustments({
    required this.settings,
    required this.onPreview,
    required this.onCommit,
    super.key,
  });

  final AppearanceSettings settings;
  final ValueChanged<AppearanceSettings> onPreview;
  final ValueChanged<AppearanceSettings> onCommit;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final blobs = settings.backgroundStyle == AppearanceBackgroundStyle.blobs;
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    return SettingsGroup(
      children: [
        _SliderRow(
          key: const ValueKey('appearance-intensity'),
          icon: shad.LucideIcons.sunDim,
          label: l10n.appearanceIntensity,
          value: settings.intensity,
          onChanged: (v) => onPreview(settings.copyWith(intensity: v)),
          onChangeEnd: (v) => onCommit(settings.copyWith(intensity: v)),
        ),
        if (blobs)
          _SliderRow(
            key: const ValueKey('appearance-softness'),
            icon: shad.LucideIcons.droplets,
            label: l10n.appearanceSoftness,
            value: settings.softness,
            onChanged: (v) => onPreview(settings.copyWith(softness: v)),
            onChangeEnd: (v) => onCommit(settings.copyWith(softness: v)),
          ),
        _SliderRow(
          key: const ValueKey('appearance-surface-opacity'),
          icon: shad.LucideIcons.layers,
          label: l10n.appearanceSurfaceOpacity,
          min: AppearanceSettings.minSurfaceOpacity,
          value: settings.surfaceOpacity,
          onChanged: (v) => onPreview(settings.copyWith(surfaceOpacity: v)),
          onChangeEnd: (v) => onCommit(settings.copyWith(surfaceOpacity: v)),
        ),
        if (blobs)
          MergeSemantics(
            child: Semantics(
              toggled: settings.animate,
              child: SettingsTile(
                key: const ValueKey('appearance-animate'),
                grouped: true,
                wrapSupportingText: true,
                icon: shad.LucideIcons.wind,
                title: l10n.appearanceAnimate,
                subtitle: reducedMotion
                    ? l10n.appearanceAnimateReducedMotion
                    : l10n.appearanceAnimateDescription,
                showChevron: false,
                onTap: () =>
                    onCommit(settings.copyWith(animate: !settings.animate)),
                trailingWidth: 60,
                trailing: ExcludeSemantics(
                  child: IgnorePointer(
                    child: shad.Switch(
                      value: settings.animate,
                      onChanged: (_) {},
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _SliderRow extends StatelessWidget {
  const _SliderRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.onChanged,
    required this.onChangeEnd,
    this.min = 0,
    super.key,
  });

  final IconData icon;
  final String label;
  final double value;
  final double min;
  final ValueChanged<double> onChanged;
  final ValueChanged<double> onChangeEnd;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final percent = '${(value * 100).round()}%';
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        SettingsRowLayout.inset,
        12,
        SettingsRowLayout.inset,
        4,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              SizedBox(
                width: SettingsRowLayout.iconWidth,
                child: Icon(
                  icon,
                  size: 22,
                  color: theme.colorScheme.foreground,
                ),
              ),
              const shad.Gap(SettingsRowLayout.textGap),
              Expanded(
                child: Text(
                  label,
                  style: theme.typography.base.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Text(
                percent,
                style: theme.typography.base.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
            ],
          ),
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              activeTrackColor: theme.colorScheme.primary,
              thumbColor: theme.colorScheme.primary,
              inactiveTrackColor: theme.colorScheme.border,
              overlayColor: theme.colorScheme.primary.withValues(alpha: 0.12),
            ),
            child: Slider(
              value: value.clamp(min, 1),
              min: min,
              label: percent,
              semanticFormatterCallback: (v) => '$label ${(v * 100).round()}%',
              onChanged: onChanged,
              onChangeEnd: onChangeEnd,
            ),
          ),
        ],
      ),
    );
  }
}
