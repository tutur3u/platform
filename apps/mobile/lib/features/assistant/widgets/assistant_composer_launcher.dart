import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantComposerFab extends StatelessWidget {
  const AssistantComposerFab({
    required this.label,
    required this.onPressed,
    super.key,
  });

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: label,
      child: SizedBox(
        height: 52,
        width: 52,
        child: AppButton.primary(
          onPressed: onPressed,
          child: const Icon(LucideIcons.messageCircle, size: 22),
        ),
      ),
    );
  }
}

class AssistantScrollToBottomFab extends StatelessWidget {
  const AssistantScrollToBottomFab({
    required this.label,
    required this.onPressed,
    super.key,
  });

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      button: true,
      child: SizedBox(
        width: 48,
        height: 48,
        child: AppButton.primary(
          onPressed: onPressed,
          shape: AppButtonShape.circle,
          density: AppButtonDensity.icon,
          child: const Icon(LucideIcons.arrowDown, size: 22),
        ),
      ),
    );
  }
}

/// Same primary action slot switches the persistent rail back to navigation.
class AssistantNavigationToggle extends StatelessWidget {
  const AssistantNavigationToggle({
    required this.focusNode,
    required this.onToggle,
    super.key,
  });
  final FocusNode focusNode;
  final VoidCallback onToggle;
  @override
  Widget build(BuildContext context) => ShellDockActionButton(
    key: const ValueKey('assistant-navigation-toggle'),
    action: ShellActionSpec(
      id: 'assistant-navigation',
      tooltip: context.l10n.assistantExpandNavigation,
      icon: LucideIcons.menu,
      onPressed: () {
        focusNode.unfocus();
        onToggle();
      },
    ),
  );
}
