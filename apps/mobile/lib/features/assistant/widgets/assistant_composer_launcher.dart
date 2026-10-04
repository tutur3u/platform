import 'package:flutter/material.dart';
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
