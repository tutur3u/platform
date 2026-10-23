import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_attachment_preview.dart';
import 'package:mobile/features/assistant/widgets/assistant_markdown_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_message_receipt.dart';
import 'package:mobile/features/assistant/widgets/assistant_message_text.dart';
import 'package:mobile/features/assistant/widgets/assistant_ordered_parts.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_names.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_results_section.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';

class AssistantTranscriptBubble extends StatefulWidget {
  const AssistantTranscriptBubble({
    required this.label,
    required this.alignEnd,
    required this.text,
    required this.transcript,
    required this.attachments,
    required this.timestamp,
    required this.toolNames,
    this.toolParts = const [],
    this.orderedParts = const [],
    this.isDraft = false,
    this.activityActive = false,
    this.receipt,
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
  final List<AssistantMessagePart> orderedParts;
  final bool isDraft;
  final bool activityActive;
  final AssistantMessageReceiptStatus? receipt;

  @override
  State<AssistantTranscriptBubble> createState() =>
      _AssistantTranscriptBubbleState();
}

class _AssistantTranscriptBubbleState extends State<AssistantTranscriptBubble> {
  bool _selected = false;
  String get label => widget.label;
  bool get alignEnd => widget.alignEnd;
  String get text => widget.text;
  String get transcript => widget.transcript;
  List<AssistantAttachment> get attachments => widget.attachments;
  DateTime? get timestamp => widget.timestamp;
  List<String> get toolNames => widget.toolNames;
  List<AssistantMessagePart> get toolParts => widget.toolParts;
  List<AssistantMessagePart> get orderedParts => widget.orderedParts;
  bool get isDraft => widget.isDraft;
  bool get activityActive => widget.activityActive;

  Future<void> _openActions(String payload) async {
    if (_selected) return;
    setState(() => _selected = true);
    try {
      await _showMessageActions(context, payload);
    } finally {
      if (mounted) setState(() => _selected = false);
    }
  }

  Widget _surface(BuildContext context, Widget child) {
    final theme = Theme.of(context);
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    final duration = reduceMotion
        ? Duration.zero
        : const Duration(milliseconds: 140);
    return AnimatedScale(
      scale: _selected && !reduceMotion ? 1.015 : 1,
      duration: duration,
      child: AnimatedContainer(
        key: const ValueKey('assistant-message-content'),
        duration: duration,
        padding: alignEnd
            ? const EdgeInsets.all(14)
            : const EdgeInsets.symmetric(vertical: 4),
        decoration: BoxDecoration(
          color: alignEnd
              ? theme.colorScheme.primaryContainer
              : Colors.transparent,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
            color: _selected ? theme.colorScheme.primary : Colors.transparent,
          ),
        ),
        child: child,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final inlineImageParts = assistantImageToolParts(toolParts);
    final copyPayload = [
      if (text.trim().isNotEmpty) text.trim(),
      if (transcript.trim().isNotEmpty) transcript.trim(),
    ].join('\n\n').trim();

    return Align(
      alignment: alignEnd ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth:
              (MediaQuery.sizeOf(context).width * (alignEnd ? 0.85 : 1) - 32)
                  .clamp(0, 620)
                  .toDouble(),
        ),
        child: Semantics(
          label: label,
          selected: _selected,
          onLongPress: copyPayload.isEmpty
              ? null
              : () => _openActions(copyPayload),
          child: GestureDetector(
            excludeFromSemantics: true,
            onLongPress: copyPayload.isEmpty
                ? null
                : () => _openActions(copyPayload),
            onSecondaryTap: copyPayload.isEmpty
                ? null
                : () => _openActions(copyPayload),
            child: Column(
              crossAxisAlignment: alignEnd
                  ? CrossAxisAlignment.end
                  : CrossAxisAlignment.start,
              children: [
                if (!alignEnd && orderedParts.isNotEmpty)
                  ..._orderedAssistantChildren(context)
                else if (text.trim().isNotEmpty ||
                    transcript.trim().isNotEmpty ||
                    inlineImageParts.isNotEmpty ||
                    attachments.isNotEmpty)
                  _surface(
                    context,
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (text.trim().isNotEmpty)
                          AssistantMessageText(
                            data: text.trim(),
                            collapsible: alignEnd && !isDraft,
                          ),
                        if (inlineImageParts.isNotEmpty) ...[
                          if (text.trim().isNotEmpty)
                            const SizedBox(height: 12),
                          AssistantInlineToolImages(parts: inlineImageParts),
                        ],
                        if (transcript.trim().isNotEmpty) ...[
                          if (text.trim().isNotEmpty ||
                              inlineImageParts.isNotEmpty)
                            const SizedBox(height: 10),
                          AssistantMarkdownBody(
                            data: transcript.trim(),
                            subdued: true,
                            selectable: false,
                          ),
                        ],
                        if (attachments.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: attachments
                                .map(
                                  (attachment) => AssistantAttachmentPreview(
                                    attachment: attachment,
                                  ),
                                )
                                .toList(growable: false),
                          ),
                        ],
                      ],
                    ),
                  ),
                if (orderedParts.isEmpty || alignEnd) ...[
                  if (toolParts.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    AssistantToolResultsSection(parts: toolParts),
                  ],
                  if (toolNames.isNotEmpty && toolParts.isEmpty) ...[
                    const SizedBox(height: 8),
                    AssistantToolNames(toolNames: toolNames),
                  ],
                ],
                if (alignEnd && timestamp != null && !isDraft)
                  AssistantMessageReceipt(
                    timestamp: timestamp!,
                    status: widget.receipt,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _orderedAssistantChildren(BuildContext context) => [
    for (final child in assistantOrderedPartWidgets(
      orderedParts,
      active: activityActive,
    ))
      if (child is Padding && child.child is AssistantMarkdownBody)
        Padding(
          key: child.key,
          padding: child.padding,
          child: _surface(context, child.child!),
        )
      else
        child,
    if (attachments.isNotEmpty)
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final attachment in attachments)
            AssistantAttachmentPreview(attachment: attachment),
        ],
      ),
  ];
}

Future<void> _showMessageActions(BuildContext context, String text) async {
  final copy = await showAdaptiveSheet<bool>(
    context: context,
    builder: (sheetContext) => AppDialogScaffold(
      title: context.l10n.assistantMessageActionsTitle,
      child: Material(
        color: Colors.transparent,
        child: ListTile(
          dense: true,
          leading: const Icon(Icons.content_copy_rounded),
          title: Text(context.l10n.assistantCopyMessageAction),
          onTap: () => Navigator.of(sheetContext).pop(true),
        ),
      ),
    ),
  );
  if (copy != true) return;
  await Clipboard.setData(ClipboardData(text: text));
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(context.l10n.assistantCopiedMessageAction)),
  );
}
