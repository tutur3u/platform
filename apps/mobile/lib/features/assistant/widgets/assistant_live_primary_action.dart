import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/l10n/l10n.dart';

/// The same navigation footprint as chat; call actions belong inside the bar.
class AssistantLivePrimaryAction extends StatelessWidget
    implements PreferredSizeWidget {
  const AssistantLivePrimaryAction({required this.onNavigation, super.key});
  final VoidCallback onNavigation;

  @override
  Size get preferredSize => const Size(52, 52);

  @override
  Widget build(BuildContext context) => ShellDockActionButton(
    action: ShellActionSpec(
      id: 'assistant-navigation',
      icon: LucideIcons.menu,
      tooltip: context.l10n.assistantExpandNavigation,
      onPressed: onNavigation,
    ),
  );
}
