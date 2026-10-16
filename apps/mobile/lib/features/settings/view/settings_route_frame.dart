import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/persistent_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Imperative settings routes cover the shell; own their visible brand and
/// safe area instead of publishing chrome only to the covered parent route.
class SettingsRouteFrame extends StatelessWidget {
  const SettingsRouteFrame({
    required this.title,
    required this.child,
    this.customNavigation = false,
    this.backIcon = Icons.chevron_left,
    this.backLabel,
    super.key,
  });
  final String title;
  final Widget child;
  final bool customNavigation;
  final IconData backIcon;
  final String? backLabel;
  @override
  Widget build(BuildContext context) => Material(
    color: shad.Theme.of(context).colorScheme.background,
    child: SafeArea(
      child: Column(
        children: [
          MobileSectionAppBar(title: title),
          Expanded(
            child: Stack(
              fit: StackFit.expand,
              children: [
                Padding(
                  padding: const EdgeInsets.only(bottom: 80),
                  child: child,
                ),
                Positioned(
                  bottom: 12,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: customNavigation
                        ? SizedBox(
                            width: 264,
                            child: PersistentShellDock(
                              content: CustomNavigationBar(
                                compact: true,
                                onSelected: (_) =>
                                    unawaited(Navigator.of(context).maybePop()),
                                children: [
                                  shad.NavigationItem(
                                    key: const ValueKey('settings-route-back'),
                                    child: Semantics(
                                      button: true,
                                      label: backLabel ?? context.l10n.navBack,
                                      child: Tooltip(
                                        message:
                                            backLabel ?? context.l10n.navBack,
                                        child: Icon(backIcon),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          )
                        : ShellDockActionButton(
                            primary: false,
                            action: ShellActionSpec(
                              id: 'settings-route-back',
                              icon: Icons.chevron_left,
                              tooltip: context.l10n.navBack,
                              onPressed: () =>
                                  unawaited(Navigator.of(context).maybePop()),
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
