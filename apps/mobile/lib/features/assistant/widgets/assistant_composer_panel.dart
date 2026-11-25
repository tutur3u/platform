import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_geometry.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_size_reporter.dart';
import 'package:mobile/features/shell/view/shell_sidebar_geometry.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantComposerPanel extends StatelessWidget {
  const AssistantComposerPanel({
    required this.showSuggestions,
    required this.onPromptSelected,
    required this.onHeightChanged,
    required this.child,
    this.controls,
    super.key,
  });

  final bool showSuggestions;
  final ValueChanged<String> onPromptSelected;
  final ValueChanged<double> onHeightChanged;
  final Widget child;

  /// Model and mode controls under the prompt, inside the same surface.
  final Widget? controls;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Positioned(
      left: 0,
      right: 0,
      bottom: assistantPageComposerBottomOffset(context),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final deviceClass = Breakpoints.fromWidth(constraints.maxWidth);
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
                  child: _Outlined(
                    child: AppCard(
                      padding: EdgeInsets.zero,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (showSuggestions)
                            AppHorizontalScrollView(
                              key: const ValueKey('assistant-starter-prompts'),
                              padding: const EdgeInsets.fromLTRB(
                                AppSpacing.sm,
                                AppSpacing.sm,
                                AppSpacing.sm,
                                0,
                              ),
                              child: Row(
                                spacing: AppSpacing.xs,
                                children: [
                                  for (final prompt in [
                                    l10n.assistantStarterFocus,
                                    l10n.assistantStarterPlan,
                                    l10n.assistantStarterBacklog,
                                    l10n.assistantStarterDraft,
                                  ])
                                    AppChip(
                                      label: Text(prompt, maxLines: 1),
                                      onPressed: () => onPromptSelected(prompt),
                                    ),
                                ],
                              ),
                            ),
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
            ),
          );
        },
      ),
    );
  }
}

/// Outlines the composer in every appearance so the prompt reads as an input
/// surface. The line is painted over the card's fill, which covers a border
/// painted beneath it. Dark schemes share their border colour with the muted
/// surface, so the outline steps up to a translucent muted foreground there.
class _Outlined extends StatelessWidget {
  const _Outlined({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    return DecoratedBox(
      key: const ValueKey('assistant-composer-outline'),
      position: DecorationPosition.foreground,
      decoration: BoxDecoration(
        border: Border.all(
          color: colors.isDark
              ? colors.mutedForeground.withValues(alpha: 0.4)
              : colors.border,
        ),
        borderRadius: BorderRadius.circular(tokens.shapes.card),
      ),
      child: child,
    );
  }
}
