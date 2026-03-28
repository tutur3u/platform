import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantTranscriptBubble extends StatelessWidget {
  const AssistantTranscriptBubble({
    required this.label,
    required this.alignEnd,
    required this.text,
    required this.transcript,
    required this.attachments,
    required this.timestamp,
    required this.toolNames,
    this.isDraft = false,
    super.key,
  });

  final String label;
  final bool alignEnd;
  final String text;
  final String transcript;
  final List<AssistantAttachment> attachments;
  final DateTime? timestamp;
  final List<String> toolNames;
  final bool isDraft;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bubbleColor = alignEnd
        ? theme.colorScheme.primaryContainer
        : theme.colorScheme.surfaceContainerLow;
    final timestampLabel = timestamp == null
        ? null
        : DateFormat.Hm().format(timestamp!.toLocal());

    return Align(
      alignment: alignEnd ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width < 420 ? 320 : 620,
        ),
        child: Column(
          crossAxisAlignment: alignEnd
              ? CrossAxisAlignment.end
              : CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: theme.textTheme.labelLarge?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: bubbleColor,
                borderRadius: BorderRadius.circular(22),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (text.trim().isNotEmpty) Text(text.trim()),
                  if (transcript.trim().isNotEmpty) ...[
                    if (text.trim().isNotEmpty) const SizedBox(height: 10),
                    Text(
                      transcript.trim(),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ],
                  if (attachments.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: attachments
                          .map(
                            (attachment) => Chip(
                              avatar: Icon(
                                attachment.isImage
                                    ? Icons.image_outlined
                                    : Icons.attach_file_rounded,
                                size: 16,
                              ),
                              label: Text(attachment.name),
                            ),
                          )
                          .toList(growable: false),
                    ),
                  ],
                  if (toolNames.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    _AssistantToolCallsCollapsible(toolNames: toolNames),
                  ],
                ],
              ),
            ),
            if (timestampLabel != null || isDraft)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  isDraft
                      ? context.l10n.assistantThinkingStatus
                      : timestampLabel ?? '',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _AssistantToolCallsCollapsible extends StatefulWidget {
  const _AssistantToolCallsCollapsible({required this.toolNames});

  final List<String> toolNames;

  @override
  State<_AssistantToolCallsCollapsible> createState() =>
      _AssistantToolCallsCollapsibleState();
}

class _AssistantToolCallsCollapsibleState
    extends State<_AssistantToolCallsCollapsible> {
  var _expanded = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final names = widget.toolNames;
    if (names.length == 1) {
      return _AssistantToolNameChip(label: names.single);
    }

    if (!_expanded) {
      return Wrap(
        spacing: 8,
        runSpacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          _AssistantToolNameChip(label: names.last),
          TextButton(
            onPressed: () => setState(() => _expanded = true),
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              visualDensity: VisualDensity.compact,
            ),
            child: Text(l10n.assistantSeeMoreLabel),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: names
              .map((tool) => _AssistantToolNameChip(label: tool))
              .toList(growable: false),
        ),
        TextButton(
          onPressed: () => setState(() => _expanded = false),
          style: TextButton.styleFrom(
            padding: const EdgeInsets.only(top: 4),
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            visualDensity: VisualDensity.compact,
          ),
          child: Text(l10n.assistantSeeLessLabel),
        ),
      ],
    );
  }
}

class _AssistantToolNameChip extends StatelessWidget {
  const _AssistantToolNameChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface.withValues(alpha: 0.66),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label, style: theme.textTheme.labelSmall),
    );
  }
}
