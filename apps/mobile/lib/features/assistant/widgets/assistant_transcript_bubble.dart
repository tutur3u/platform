import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_markdown_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_results_section.dart';
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
    this.toolParts = const [],
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
  final List<AssistantMessagePart> toolParts;
  final bool isDraft;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final inlineImageParts = assistantImageToolParts(toolParts);
    final bubbleColor = alignEnd
        ? theme.colorScheme.primaryContainer
        : theme.colorScheme.surfaceContainerLow;
    final timestampLabel = timestamp == null
        ? null
        : DateFormat.Hm().format(timestamp!.toLocal());
    final copyPayload = [
      if (text.trim().isNotEmpty) text.trim(),
      if (transcript.trim().isNotEmpty) transcript.trim(),
    ].join('\n\n').trim();

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
                  if (text.trim().isNotEmpty)
                    _AssistantMessageMarkdownBody(
                      data: text.trim(),
                      collapsible: alignEnd && !isDraft,
                    ),
                  if (inlineImageParts.isNotEmpty) ...[
                    if (text.trim().isNotEmpty) const SizedBox(height: 12),
                    AssistantInlineToolImages(parts: inlineImageParts),
                  ],
                  if (transcript.trim().isNotEmpty) ...[
                    if (text.trim().isNotEmpty || inlineImageParts.isNotEmpty)
                      const SizedBox(height: 10),
                    AssistantMarkdownBody(
                      data: transcript.trim(),
                      subdued: true,
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
                  if (toolParts.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    AssistantToolResultsSection(parts: toolParts),
                  ],
                  if (toolNames.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    _AssistantToolCallsCollapsible(toolNames: toolNames),
                  ],
                ],
              ),
            ),
            if (copyPayload.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: _AssistantCopyMessageButton(
                  alignEnd: alignEnd,
                  text: copyPayload,
                ),
              ),
            if (timestampLabel != null || isDraft)
              Padding(
                padding: const EdgeInsets.only(top: 4),
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

class _AssistantCopyMessageButton extends StatefulWidget {
  const _AssistantCopyMessageButton({
    required this.alignEnd,
    required this.text,
  });

  final bool alignEnd;
  final String text;

  @override
  State<_AssistantCopyMessageButton> createState() =>
      _AssistantCopyMessageButtonState();
}

class _AssistantCopyMessageButtonState
    extends State<_AssistantCopyMessageButton> {
  bool _copied = false;
  Timer? _resetTimer;

  @override
  void dispose() {
    _resetTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: widget.alignEnd ? Alignment.centerRight : Alignment.centerLeft,
      child: TextButton.icon(
        onPressed: _handleCopy,
        style: TextButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          minimumSize: Size.zero,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          visualDensity: VisualDensity.compact,
        ),
        icon: Icon(
          _copied ? Icons.check_rounded : Icons.content_copy_rounded,
          size: 16,
        ),
        label: Text(
          _copied
              ? context.l10n.assistantCopiedMessageAction
              : context.l10n.assistantCopyMessageAction,
        ),
      ),
    );
  }

  Future<void> _handleCopy() async {
    await Clipboard.setData(ClipboardData(text: widget.text));
    if (!mounted) {
      return;
    }
    _resetTimer?.cancel();
    setState(() => _copied = true);
    _resetTimer = Timer(const Duration(seconds: 2), () {
      if (!mounted) {
        return;
      }
      setState(() => _copied = false);
    });
  }
}

class _AssistantMessageMarkdownBody extends StatefulWidget {
  const _AssistantMessageMarkdownBody({
    required this.data,
    required this.collapsible,
  });

  final String data;
  final bool collapsible;

  @override
  State<_AssistantMessageMarkdownBody> createState() =>
      _AssistantMessageMarkdownBodyState();
}

class _AssistantMessageMarkdownBodyState
    extends State<_AssistantMessageMarkdownBody> {
  static const _collapsedLineCount = 4;

  var _expanded = false;

  @override
  void didUpdateWidget(covariant _AssistantMessageMarkdownBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.data != widget.data) {
      _expanded = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.collapsible) {
      return AssistantMarkdownBody(data: widget.data);
    }

    final theme = Theme.of(context);
    final l10n = context.l10n;
    final markdownStyle = assistantMarkdownStyle(theme, subdued: false);
    final baseStyle =
        markdownStyle.p ??
        theme.textTheme.bodyMedium?.copyWith(height: 1.45) ??
        const TextStyle(fontSize: 14, height: 1.45);

    return LayoutBuilder(
      builder: (context, constraints) {
        final plainText = _markdownPlainText(widget.data);
        if (plainText.isEmpty) {
          return AssistantMarkdownBody(data: widget.data);
        }
        final painter = TextPainter(
          text: TextSpan(text: plainText, style: baseStyle),
          textDirection: Directionality.of(context),
          maxLines: _collapsedLineCount,
        )..layout(maxWidth: constraints.maxWidth);
        final shouldCollapse = painter.didExceedMaxLines;

        if (!shouldCollapse) {
          return AssistantMarkdownBody(data: widget.data);
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_expanded)
              AssistantMarkdownBody(data: widget.data)
            else
              Text(
                plainText,
                maxLines: _collapsedLineCount,
                overflow: TextOverflow.fade,
                softWrap: true,
                style: baseStyle.copyWith(
                  color:
                      baseStyle.color ?? theme.colorScheme.onPrimaryContainer,
                ),
              ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => setState(() => _expanded = !_expanded),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.only(top: 8),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  visualDensity: VisualDensity.compact,
                ),
                child: Text(
                  _expanded
                      ? l10n.assistantSeeLessLabel
                      : l10n.assistantSeeMoreLabel,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

String _markdownPlainText(String markdown) {
  return markdown
      .replaceAll(RegExp(r'```[\s\S]*?```'), ' ')
      .replaceAllMapped(
        RegExp('`([^`]*)`'),
        (match) => match.group(1) ?? '',
      )
      .replaceAll(RegExp(r'!\[([^\]]*)\]\([^)]+\)'), r'$1')
      .replaceAll(RegExp(r'\[([^\]]+)\]\([^)]+\)'), r'$1')
      .replaceAll(RegExp(r'(^|\s)[#>*_~-]+', multiLine: true), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
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
