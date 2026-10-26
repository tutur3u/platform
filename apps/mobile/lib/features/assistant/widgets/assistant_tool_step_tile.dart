import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_json_preview.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_labels.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_steps.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// One tool call: friendly label, short summary, raw payload behind Details.
class AssistantToolStepTile extends StatefulWidget {
  const AssistantToolStepTile({
    required this.part,
    this.active = false,
    super.key,
  });

  final AssistantMessagePart part;

  /// Whether the owning message is still streaming.
  final bool active;

  @override
  State<AssistantToolStepTile> createState() => _AssistantToolStepTileState();
}

class _AssistantToolStepTileState extends State<AssistantToolStepTile> {
  bool _details = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final l10n = context.l10n;
    final part = widget.part;
    final running = widget.active && isAssistantToolPartPending(part);
    final failed = isAssistantToolPartFailed(part);
    final summary = failed
        ? l10n.assistantToolStepFailed
        : running
        ? l10n.assistantToolStepRunning
        : assistantToolStepSummary(l10n, part);
    final hasPayload = part.input != null || part.output != null;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: failed
                      ? colors.error.withValues(alpha: 0.12)
                      : colors.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: running
                    ? const NovaLoadingIndicator(size: 14)
                    : Icon(
                        failed
                            ? LucideIcons.circleAlert
                            : assistantToolStepIcon(part.toolName),
                        size: 14,
                        color: failed ? colors.error : colors.onSurfaceVariant,
                      ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      assistantToolStepLabel(
                        l10n,
                        part.toolName,
                        running: running,
                      ),
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: colors.onSurface,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      summary,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: failed ? colors.error : colors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              if (hasPayload)
                AppButton.ghost(
                  key: ValueKey(
                    'assistant-tool-details-'
                    '${part.toolCallId ?? part.toolName}',
                  ),
                  density: AppButtonDensity.compact,
                  size: AppButtonSize.small,
                  onPressed: () => setState(() => _details = !_details),
                  trailing: Icon(
                    _details ? LucideIcons.chevronUp : LucideIcons.chevronDown,
                    size: 14,
                  ),
                  child: Text(
                    _details
                        ? l10n.assistantToolStepHideDetails
                        : l10n.assistantToolStepDetails,
                  ),
                ),
            ],
          ),
          if (_details)
            Padding(
              padding: const EdgeInsetsDirectional.only(start: 38, top: 6),
              child: AssistantToolJsonPreview(
                data: {
                  if (part.input != null) 'input': part.input,
                  if (part.output != null) 'output': part.output,
                },
              ),
            ),
        ],
      ),
    );
  }
}

/// A short human summary of a finished call; never raw identifiers.
String assistantToolStepSummary(
  AppLocalizations l10n,
  AssistantMessagePart part,
) {
  final input = part.input;
  if (input is Map) {
    for (final key in const ['query', 'prompt', 'title', 'name']) {
      final value = input[key];
      if (value is String && value.trim().isNotEmpty) return value.trim();
    }
  }
  final output = part.output;
  if (output is List) return l10n.assistantToolStepResultCount(output.length);
  if (output is Map) {
    for (final key in const ['message', 'summary']) {
      final value = output[key];
      if (value is String && value.trim().isNotEmpty) return value.trim();
    }
    for (final value in output.values) {
      if (value is List) return l10n.assistantToolStepResultCount(value.length);
    }
  }
  if (output is String && output.trim().isNotEmpty) {
    final text = output.trim();
    if (!text.startsWith('{') && !text.startsWith('[')) {
      return text.split('\n').first;
    }
  }
  return l10n.assistantToolStepDone;
}
