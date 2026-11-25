import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_geometry.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_size_reporter.dart';
import 'package:mobile/features/shell/view/shell_sidebar_geometry.dart';

class AssistantComposerPanel extends StatelessWidget {
  const AssistantComposerPanel({
    required this.onHeightChanged,
    required this.child,
    this.controls,
    super.key,
  });

  final ValueChanged<double> onHeightChanged;
  final Widget child;

  /// Model controls under the prompt, inside the same surface.
  final Widget? controls;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: 0,
      right: 0,
      bottom: assistantPageComposerBottomOffset(context),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final deviceClass = Breakpoints.fromWidth(constraints.maxWidth);
          final colors = AppTokens.of(context).colorScheme;
          final withDock =
              shellNavigationModeFor(MediaQuery.sizeOf(context)) ==
              ShellNavigationMode.dock;
          final maxWidth = withDock
              ? null
              : AppLayout.maxContentWidth(AppPageKind.reading, deviceClass);
          final panelWidth = math.min(
            constraints.maxWidth,
            maxWidth ?? constraints.maxWidth,
          );
          final insets = withDock
              ? AppPageInsets.of(
                  context,
                  width: constraints.maxWidth,
                  kind: AppPageKind.root,
                  consumeBottomClearance: false,
                ).copyWith(top: 0)
              : EdgeInsets.symmetric(horizontal: AppLayout.gutter(deviceClass));
          return Center(
            child: SizedBox(
              width: panelWidth,
              child: AssistantComposerSizeReporter(
                onHeightChanged: onHeightChanged,
                child: Padding(
                  padding: insets,
                  child: AppCard(
                    key: const ValueKey('assistant-composer-outline'),
                    padding: EdgeInsets.zero,
                    // The prompt reads as an input surface in every
                    // appearance. Dark schemes share their border colour with
                    // the muted surface, so the outline uses a translucent
                    // muted foreground there.
                    borderColor: colors.isDark
                        ? colors.mutedForeground.withValues(alpha: 0.4)
                        : colors.border,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Padding(
                          padding: const EdgeInsets.all(AppSpacing.xs),
                          child: child,
                        ),
                        ?controls,
                      ],
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
