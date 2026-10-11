import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_geometry.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/l10n/l10n.dart';

/// The transcript action shares the composer's physical safe-area baseline.
class AssistantScrollToBottomOverlay extends StatelessWidget {
  const AssistantScrollToBottomOverlay({
    required this.composerVisible,
    required this.isFullscreen,
    required this.navigationExpanded,
    required this.visible,
    required this.onPressed,
    this.composerHeight,
    super.key,
  });

  final bool composerVisible;
  final double? composerHeight;
  final bool isFullscreen;
  final bool navigationExpanded;
  final bool visible;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    final bottom = assistantTranscriptBottomClearance(
      context,
      composerVisible: composerVisible,
      composerHeight: composerHeight,
    );
    return Positioned(
      left: 0,
      right: 0,
      bottom: bottom,
      child: IgnorePointer(
        ignoring: !visible,
        child: Center(
          child: AnimatedSlide(
            duration: reducedMotion
                ? Duration.zero
                : const Duration(milliseconds: 180),
            curve: Curves.easeOutCubic,
            offset: visible ? Offset.zero : const Offset(0, 1),
            child: AnimatedOpacity(
              duration: reducedMotion
                  ? Duration.zero
                  : const Duration(milliseconds: 160),
              curve: Curves.easeOutCubic,
              opacity: visible ? 1 : 0,
              child: AssistantScrollToBottomFab(
                label: context.l10n.assistantScrollToBottomAction,
                onPressed: onPressed,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
