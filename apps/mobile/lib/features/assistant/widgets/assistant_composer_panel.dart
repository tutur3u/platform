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
    super.key,
  });

  final bool showSuggestions;
  final ValueChanged<String> onPromptSelected;
  final ValueChanged<double> onHeightChanged;
  final Widget child;

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
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (showSuggestions) ...[
                      AppHorizontalScrollView(
                        key: const ValueKey('assistant-starter-prompts'),
                        padding: insets,
                        child: ConstrainedBox(
                          constraints: BoxConstraints(
                            minWidth: maxWidth == null
                                ? 0
                                : math.max(0, panelWidth - insets.horizontal),
                          ),
                          child: Row(
                            mainAxisAlignment: withDock
                                ? MainAxisAlignment.start
                                : MainAxisAlignment.center,
                            spacing: AppSpacing.sm,
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
                      ),
                      const SizedBox(height: AppSpacing.xs),
                    ],
                    Padding(
                      padding: insets,
                      child: AppCard(
                        padding: const EdgeInsets.all(AppSpacing.xs),
                        child: child,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
