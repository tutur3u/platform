import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/cubit/sorbet_cubit.dart';
import 'package:mobile/features/settings/cubit/sorbet_state.dart';
import 'package:mobile/features/settings/view/appearance/appearance_labels.dart';
import 'package:mobile/features/settings/view/appearance/appearance_pickers.dart';
import 'package:mobile/features/settings/view/appearance/appearance_sorbet_palette.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';

/// Appearance → Experimental design: the Sorbet switch and, while it is on,
/// the palette and corner options. Values sync with the account.
class AppearanceSorbetSection extends StatelessWidget {
  const AppearanceSorbetSection({
    required this.state,
    required this.cubit,
    super.key,
  });

  final SorbetState state;
  final SorbetCubit cubit;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = state.theme;
    final brightness = AppTokens.of(context).brightness;

    void choose(Future<void> Function() apply) {
      unawaited(AppHaptics.selection());
      unawaited(apply());
    }

    List<Widget> block(String caption, Widget child) => [
      SettingsCaption(caption),
      const AppGap(8),
      child,
      const AppGap(SettingsRowLayout.groupGap),
    ];

    return Column(
      key: const ValueKey('appearance-sorbet-section'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ...block(
          l10n.appearanceExperimentalTitle,
          SettingsGroup(
            children: [
              SettingsSwitchRow(
                key: const ValueKey('appearance-sorbet'),
                icon: LucideIcons.flaskConical,
                title: l10n.appearanceSorbetToggle,
                value: state.enabled,
                onChanged: (value) =>
                    choose(() => cubit.setEnabled(enabled: value)),
              ),
            ],
          ),
        ),
        if (state.enabled) ...[
          ...block(
            l10n.appearanceSorbetPaletteTitle,
            AppearanceSorbetPalette(
              key: const ValueKey('appearance-sorbet-palette'),
              selected: theme.preset,
              brightness: brightness,
              onSelected: (preset) =>
                  choose(() => cubit.setTheme(theme.copyWith(preset: preset))),
            ),
          ),
          ...block(
            l10n.appearanceCornersTitle,
            AppearanceSegmented<SorbetRadius>(
              key: const ValueKey('appearance-sorbet-radius'),
              values: SorbetRadius.values,
              selected: theme.radius,
              label: l10n.sorbetRadius,
              icon: (radius) => switch (radius) {
                SorbetRadius.soft => LucideIcons.squircle,
                SorbetRadius.sharp => LucideIcons.square,
                SorbetRadius.round => LucideIcons.circle,
              },
              onSelected: (radius) =>
                  choose(() => cubit.setTheme(theme.copyWith(radius: radius))),
            ),
          ),
        ],
      ],
    );
  }
}
