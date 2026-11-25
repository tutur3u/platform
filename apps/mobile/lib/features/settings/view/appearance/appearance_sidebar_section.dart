import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/shell/cubit/sidebar_behavior.dart';
import 'package:mobile/features/shell/cubit/sidebar_behavior_cubit.dart';
import 'package:mobile/features/shell/view/shell_sidebar_geometry.dart';
import 'package:mobile/features/shell/view/shell_sidebar_mode_menu.dart';
import 'package:mobile/l10n/l10n.dart';

class AppearanceSidebarSection extends StatelessWidget {
  const AppearanceSidebarSection({super.key});

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    if (shellNavigationModeFor(size) != ShellNavigationMode.rail) {
      return const SizedBox.shrink();
    }
    final cubit = context.watch<SidebarBehaviorCubit?>();
    if (cubit == null) return const SizedBox.shrink();

    final state = cubit.state;
    final behavior = state.behavior ?? defaultSidebarBehaviorFor(size);
    final l10n = context.l10n;
    return Padding(
      padding: const EdgeInsets.only(bottom: SettingsRowLayout.groupGap),
      child: SettingsGroup(
        children: [
          SettingsChoiceRow<SidebarBehavior>(
            icon: LucideIcons.panelLeft,
            title: l10n.appearanceSidebarTitle,
            value: behavior,
            options: [
              for (final value in SidebarBehavior.values)
                AppSelectOption(
                  value: value,
                  label: sidebarBehaviorLabel(context, value),
                ),
            ],
            onChanged: state.ready
                ? (value) => unawaited(cubit.setBehavior(value))
                : null,
          ),
          if (state.hasAccount)
            SettingsSwitchRow(
              icon: LucideIcons.laptop,
              title: l10n.appearanceSidebarLocalOverride,
              value: state.localOverride,
              onChanged: state.ready
                  ? (value) => unawaited(
                      cubit.setLocalOverride(value: value, displayed: behavior),
                    )
                  : null,
            ),
        ],
      ),
    );
  }
}
