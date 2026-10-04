import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/features/shell/view/floating_dock_rail.dart';

/// Exactly one interactive dock branch, including during mode transitions.
class AssistantMorphingDock extends StatelessWidget {
  const AssistantMorphingDock({
    required this.isComposing,
    required this.navigation,
    required this.composer,
    required this.composeLabel,
    required this.onCompose,
    super.key,
  });
  final bool isComposing;
  final Widget navigation;
  final Widget composer;
  final String composeLabel;
  final VoidCallback onCompose;

  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
    duration: MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : const Duration(milliseconds: 180),
    switchInCurve: Curves.easeOutCubic,
    // Do not stack the outgoing navigation on the prompt, even for one frame.
    layoutBuilder: (current, _) => current ?? const SizedBox.shrink(),
    child: isComposing
        ? KeyedSubtree(
            key: const ValueKey('assistant-dock-chat'),
            child: composer,
          )
        : FloatingDockRail(
            key: const ValueKey('assistant-dock-navigation'),
            navigation: navigation,
            primary: AssistantComposerFab(
              label: composeLabel,
              onPressed: onCompose,
            ),
          ),
  );
}
