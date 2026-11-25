import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_labels.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_steps.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// One collapsed ghost accordion for every visible tool step in a turn.
class AssistantToolSummary extends StatefulWidget {
  const AssistantToolSummary({
    required this.parts,
    required this.tileBuilder,
    this.running = false,
    super.key,
  });

  /// Visible steps only; meta and inline-image tools are filtered upstream.
  final List<AssistantMessagePart> parts;
  final Widget Function(AssistantMessagePart) tileBuilder;
  final bool running;

  @override
  State<AssistantToolSummary> createState() => _AssistantToolSummaryState();
}

class _AssistantToolSummaryState extends State<AssistantToolSummary> {
  bool _expanded = false;

  void _toggle() => setState(() => _expanded = !_expanded);

  @override
  Widget build(BuildContext context) {
    final parts = widget.parts;
    if (parts.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final l10n = context.l10n;
    final colors = theme.colorScheme;
    final tokens = AppTokens.of(context);
    final palette = tokens.colorScheme;
    final running = widget.running;
    final latestPart = running
        ? parts.lastWhere(isAssistantToolPartPending, orElse: () => parts.last)
        : parts.last;
    final failedCount = parts.where(isAssistantToolPartFailed).length;
    final failed = !running && failedCount > 0;
    // A failed turn leads with what needs attention rather than a past-tense
    // label for a step that did not finish.
    final latest = failed
        ? l10n.assistantToolStepsFailed(failedCount)
        : assistantToolStepLabel(l10n, latestPart.toolName, running: running);
    final count = l10n.assistantToolStepCount(parts.length);
    final countStyle = theme.textTheme.labelMedium?.copyWith(
      color: colors.onSurfaceVariant,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    final status = running
        ? l10n.assistantToolStepsInProgress
        : l10n.assistantToolStepsDone;
    final radius = BorderRadius.circular(AppRadius.md);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          container: true,
          button: true,
          excludeSemantics: true,
          onTap: _toggle,
          expanded: _expanded,
          label: failed ? '$latest · $count' : '$status: $latest · $count',
          // The status card mirrors the web tool section: a quiet surface
          // that turns destructive when a step needs attention.
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: failed
                  ? palette.destructive.withValues(alpha: 0.06)
                  : palette.muted.withValues(alpha: palette.isDark ? 0.3 : 0.4),
              border: Border.all(
                color: failed
                    ? palette.destructive.withValues(alpha: 0.3)
                    : palette.border,
              ),
              borderRadius: radius,
            ),
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                key: const ValueKey('assistant-tools-toggle'),
                borderRadius: radius,
                onTap: _toggle,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.sm,
                    vertical: AppSpacing.xs + 2,
                  ),
                  child: LayoutBuilder(
                    builder: (context, constraints) => Row(
                      children: [
                        SizedBox.square(
                          dimension: 16,
                          child: running
                              ? const NovaLoadingIndicator(
                                  key: ValueKey('assistant-tools-running-icon'),
                                  size: 16,
                                )
                              : failed
                              ? Icon(
                                  LucideIcons.circleAlert,
                                  key: const ValueKey(
                                    'assistant-tools-error-icon',
                                  ),
                                  size: 16,
                                  color: palette.destructive,
                                )
                              : Icon(
                                  LucideIcons.circleCheck,
                                  key: const ValueKey(
                                    'assistant-tools-done-icon',
                                  ),
                                  size: 16,
                                  color: palette.success,
                                ),
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            latest,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.labelMedium?.copyWith(
                              color: colors.onSurface,
                            ),
                          ),
                        ),
                        // The count keeps priority but never overflows at
                        // large text scales.
                        ConstrainedBox(
                          constraints: BoxConstraints(
                            maxWidth: constraints.maxWidth * 0.6,
                          ),
                          child: Text(
                            ' · $count',
                            key: const ValueKey('assistant-tools-count'),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: countStyle,
                          ),
                        ),
                        const SizedBox(width: 4),
                        AnimatedRotation(
                          turns: _expanded ? 0.5 : 0,
                          duration: MediaQuery.disableAnimationsOf(context)
                              ? Duration.zero
                              : const Duration(milliseconds: 180),
                          child: Icon(
                            LucideIcons.chevronDown,
                            size: 16,
                            color: colors.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        AnimatedSize(
          duration: MediaQuery.disableAnimationsOf(context)
              ? Duration.zero
              : const Duration(milliseconds: 180),
          alignment: Alignment.topLeft,
          child: !_expanded
              ? const SizedBox.shrink()
              : Padding(
                  padding: const EdgeInsets.only(left: 15, top: 4, bottom: 6),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      border: BorderDirectional(
                        start: BorderSide(color: colors.outlineVariant),
                      ),
                    ),
                    child: Padding(
                      padding: const EdgeInsetsDirectional.only(start: 12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          for (var i = 0; i < parts.length; i++)
                            KeyedSubtree(
                              key: ValueKey(
                                'assistant-tool-step-'
                                '${parts[i].toolCallId ?? i}',
                              ),
                              child: widget.tileBuilder(parts[i]),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
        ),
      ],
    );
  }
}
