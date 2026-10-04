import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Color mailSettingsBackground(BuildContext context) =>
    shad.Theme.of(context).colorScheme.background;

/// One settings implementation, reached from Mail or the central Settings hub.
class MailSettingsChrome extends StatelessWidget {
  const MailSettingsChrome({
    required this.locations,
    required this.child,
    required this.canManage,
    this.onSave,
    this.onBack,
    this.backEnabled = true,
    super.key,
  });
  final Set<String> locations;
  final Widget child;
  final bool canManage;
  final Future<void> Function()? onSave;
  final Future<void> Function()? onBack;
  final bool backEnabled;

  @override
  Widget build(BuildContext context) {
    final sharedShell = lookupShellTitleOverrideCubit(context) != null;
    void back() {
      if (!backEnabled) return;
      final exit = onBack;
      if (exit != null) {
        unawaited(exit());
      } else {
        unawaited(Navigator.of(context).maybePop());
      }
    }

    return ColoredBox(
      color: shad.Theme.of(context).colorScheme.background,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Padding(
            padding: EdgeInsets.only(bottom: sharedShell ? 0 : 76),
            child: child,
          ),
          if (sharedShell) ...[
            ShellTitleOverride(
              ownerId: 'mail-settings',
              locations: locations,
              title: context.l10n.mailSettings,
            ),
            ShellMiniNav(
              ownerId: 'mail-settings',
              locations: locations,
              items: [
                ShellMiniNavItemSpec(
                  id: 'back',
                  enabled: backEnabled,
                  icon: Icons.chevron_left,
                  label: context.l10n.navBack,
                  onPressed: back,
                ),
              ],
            ),
            ShellChromeActions(
              ownerId: 'mail-settings',
              locations: locations,
              actions: [
                if (canManage)
                  ShellActionSpec(
                    id: 'mail-settings-save',
                    icon: Icons.save_outlined,
                    tooltip: context.l10n.commonSave,
                    inDock: true,
                    enabled: onSave != null,
                    callbackToken: onSave,
                    onPressed: () {
                      final save = onSave;
                      if (save != null) unawaited(save());
                    },
                  ),
              ],
            ),
          ] else
            Positioned(
              left: 16,
              right: 16,
              bottom: 12,
              child: SafeArea(
                top: false,
                child: Row(
                  children: [
                    IconButton(
                      onPressed: backEnabled ? back : null,
                      tooltip: context.l10n.navBack,
                      icon: const Icon(Icons.arrow_back),
                    ),
                    const Spacer(),
                    if (canManage)
                      IconButton(
                        onPressed: onSave,
                        tooltip: context.l10n.commonSave,
                        icon: const Icon(Icons.save_outlined),
                      ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
