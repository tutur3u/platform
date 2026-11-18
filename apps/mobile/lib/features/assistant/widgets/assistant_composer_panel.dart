import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
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
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final sorbet = SorbetTokens.maybeOf(context);
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
          );
          return Padding(
            padding: insets.copyWith(top: 0, bottom: 0),
            child: AssistantComposerSizeReporter(
              onHeightChanged: onHeightChanged,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (showSuggestions) ...[
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          for (final prompt in [
                            l10n.assistantStarterFocus,
                            l10n.assistantStarterPlan,
                            l10n.assistantStarterBacklog,
                            l10n.assistantStarterDraft,
                          ])
                            Padding(
                              padding: const EdgeInsetsDirectional.only(end: 8),
                              child: AppChip(
                                label: Text(prompt, maxLines: 1),
                                onPressed: () => onPromptSelected(prompt),
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 4),
                  ],
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: sorbet?.surface ?? colors.card,
                      border: Border.all(color: colors.input),
                      borderRadius: BorderRadius.circular(tokens.shapes.panel),
                      boxShadow: tokens.depth.card,
                    ),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(4, 8, 4, 2),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsetsDirectional.only(start: 8),
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color:
                                    sorbet?.hues.blue.fill ??
                                    AppTone.info.fill(colors),
                                borderRadius: BorderRadius.circular(
                                  tokens.shapes.chip,
                                ),
                              ),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 3,
                                ),
                                child: Text(
                                  l10n.calendarToday,
                                  style: tokens.typography.uiCompact.copyWith(
                                    color: sorbet?.hues.blue.ink ?? colors.info,
                                  ),
                                ),
                              ),
                            ),
                          ),
                          child,
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
