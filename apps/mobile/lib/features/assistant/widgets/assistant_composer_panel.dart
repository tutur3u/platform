import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_size_reporter.dart';
import 'package:mobile/l10n/l10n.dart';

double assistantPageComposerClearance(BuildContext context) =>
    MediaQuery.viewInsetsOf(context).bottom > 0
    ? 0
    : AppPageInsets.contentBottomClearance(context);

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
      bottom: assistantPageComposerClearance(context),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final insets = AppPageInsets.of(
            context,
            width: constraints.maxWidth,
            kind: AppPageKind.root,
            consumeBottomClearance: false,
          ).copyWith(top: 0);
          return AssistantComposerSizeReporter(
            onHeightChanged: onHeightChanged,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (showSuggestions) ...[
                  SingleChildScrollView(
                    key: const ValueKey('assistant-starter-prompts'),
                    scrollDirection: Axis.horizontal,
                    padding: insets,
                    child: Row(
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
          );
        },
      ),
    );
  }
}
