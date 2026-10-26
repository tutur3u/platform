import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/appearance/appearance_labels.dart';
import 'package:mobile/features/settings/view/appearance/appearance_pickers.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';

/// Appearance → Interface: style, density, corners, haptics and reduced
/// motion. Choices apply through the theme instantly and persist on this
/// device only.
class AppearanceInterfaceSection extends StatefulWidget {
  const AppearanceInterfaceSection({
    required this.settings,
    required this.onChanged,
    super.key,
  });

  final AppearanceSettings settings;
  final ValueChanged<AppearanceSettings> onChanged;

  @override
  State<AppearanceInterfaceSection> createState() =>
      _AppearanceInterfaceSectionState();
}

class _AppearanceInterfaceSectionState
    extends State<AppearanceInterfaceSection> {
  // Haptics keep their own device preference, shared with Settings.
  bool _haptics = AppHaptics.enabled;

  Future<void> _toggleHaptics() async {
    final next = !_haptics;
    setState(() => _haptics = next);
    await AppHaptics.setEnabled(value: next);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final settings = widget.settings;
    final tokens = AppTokens.of(context);

    Widget block(String caption, Widget child, {String? note}) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SettingsCaption(caption),
        const AppGap(8),
        child,
        if (note != null) ...[
          const AppGap(6),
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: SettingsRowLayout.captionInset,
            ),
            child: Text(
              note,
              style: tokens.typography.small.copyWith(
                color: tokens.colorScheme.mutedForeground,
              ),
            ),
          ),
        ],
        const AppGap(SettingsRowLayout.groupGap),
      ],
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        block(
          l10n.appearanceStyleTitle,
          AppearanceSegmented<AppInterfaceStyle>(
            key: const ValueKey('appearance-style'),
            values: AppInterfaceStyle.values,
            selected: settings.interfaceStyle,
            label: l10n.appearanceStyle,
            icon: (style) => switch (style) {
              AppInterfaceStyle.tuturuuu => LucideIcons.sparkles,
              AppInterfaceStyle.ios => LucideIcons.smartphone,
              AppInterfaceStyle.material => LucideIcons.layers,
            },
            onSelected: (style) =>
                widget.onChanged(settings.copyWith(interfaceStyle: style)),
          ),
          note: l10n.appearanceStyleDescription,
        ),
        block(
          l10n.appearanceDensityTitle,
          AppearanceSegmented<AppDensity>(
            key: const ValueKey('appearance-density'),
            values: AppDensity.values,
            selected: settings.density,
            label: l10n.appearanceDensity,
            icon: (density) => switch (density) {
              AppDensity.comfortable => LucideIcons.rows2,
              AppDensity.compact => LucideIcons.rows4,
            },
            onSelected: (density) =>
                widget.onChanged(settings.copyWith(density: density)),
          ),
        ),
        block(
          l10n.appearanceCornersTitle,
          AppearanceSegmented<AppCornerStyle>(
            key: const ValueKey('appearance-corners'),
            values: AppCornerStyle.values,
            selected: settings.corners,
            label: l10n.appearanceCorners,
            icon: (corners) => switch (corners) {
              AppCornerStyle.rounded => LucideIcons.squircle,
              AppCornerStyle.soft => LucideIcons.squareRoundCorner,
              AppCornerStyle.square => LucideIcons.square,
            },
            onSelected: (corners) =>
                widget.onChanged(settings.copyWith(corners: corners)),
          ),
        ),
        block(
          l10n.appearanceFeedbackTitle,
          SettingsGroup(
            children: [
              _ToggleTile(
                key: const ValueKey('appearance-haptics'),
                icon: LucideIcons.vibrate,
                title: l10n.settingsHaptics,
                subtitle: l10n.appearanceHapticsDescription,
                value: _haptics,
                onTap: () => unawaited(_toggleHaptics()),
              ),
              _ToggleTile(
                key: const ValueKey('appearance-reduce-motion'),
                icon: LucideIcons.pause,
                title: l10n.appearanceReduceMotion,
                subtitle: l10n.appearanceReduceMotionDescription,
                value: settings.reduceMotion,
                onTap: () => widget.onChanged(
                  settings.copyWith(reduceMotion: !settings.reduceMotion),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ToggleTile extends StatelessWidget {
  const _ToggleTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => MergeSemantics(
    child: Semantics(
      toggled: value,
      child: SettingsTile(
        grouped: true,
        wrapSupportingText: true,
        icon: icon,
        title: title,
        subtitle: subtitle,
        showChevron: false,
        onTap: onTap,
        trailingWidth: 60,
        trailing: ExcludeSemantics(
          child: IgnorePointer(
            child: AppSwitch(value: value, onChanged: (_) {}),
          ),
        ),
      ),
    ),
  );
}
