import 'package:flutter/material.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
        child: FilledButton(
          onPressed: onPressed,
          style: FilledButton.styleFrom(padding: const EdgeInsets.all(12)),
          child: const Icon(Icons.chat_bubble_outline_rounded, size: 22),
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
        child: shad.PrimaryButton(
          onPressed: onPressed,
          shape: shad.ButtonShape.circle,
          density: shad.ButtonDensity.icon,
          child: const Icon(Icons.arrow_downward_rounded, size: 22),
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
      icon: Icons.menu_rounded,
      onPressed: () {
        focusNode.unfocus();
        onToggle();
      },
    ),
  );
}
