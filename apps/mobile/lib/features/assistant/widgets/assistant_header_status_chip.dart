import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantHeaderStatusChip extends StatelessWidget {
  const AssistantHeaderStatusChip({
    required this.label,
    this.onPressed,
    this.child,
    super.key,
  });
  final String label;
  final Widget? child;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Tooltip(
      message: '${context.l10n.assistantLocalModeAction}: $label',
      child: Semantics(
        button: true,
        label: '${context.l10n.assistantLocalModeAction}: $label',
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: child == null ? 108 : double.infinity,
            minHeight: 48,
          ),
          child: TextButton(
            key: const ValueKey('assistant-local-header-status'),
            onPressed: onPressed,
            style: TextButton.styleFrom(
              padding: child == null
                  ? const EdgeInsets.symmetric(horizontal: 8)
                  : EdgeInsets.zero,
              foregroundColor: theme.colorScheme.onPrimaryContainer,
              backgroundColor: theme.colorScheme.primaryContainer,
              shape: const StadiumBorder(),
            ),
            child:
                child ??
                Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
        ),
      ),
    );
  }
}
