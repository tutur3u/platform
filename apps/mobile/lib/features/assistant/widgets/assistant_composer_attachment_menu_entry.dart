import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_attachment_preview.dart';

/// Interactive previews must not inherit a disabled popup-item semantic state.
class AssistantComposerAttachmentMenuEntry<T> extends PopupMenuEntry<T> {
  const AssistantComposerAttachmentMenuEntry({
    required this.attachment,
    required this.onRemove,
    super.key,
  });

  final AssistantAttachment attachment;
  final Future<void> Function(String) onRemove;

  @override
  double get height => 56;

  @override
  bool represents(T? value) => false;

  @override
  State<AssistantComposerAttachmentMenuEntry<T>> createState() =>
      _AssistantComposerAttachmentMenuEntryState<T>();
}

class _AssistantComposerAttachmentMenuEntryState<T>
    extends State<AssistantComposerAttachmentMenuEntry<T>> {
  @override
  Widget build(BuildContext context) {
    final deleteLabel = MaterialLocalizations.of(context).deleteButtonTooltip;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(
        children: [
          Flexible(
            child: SizedBox(
              height: 48,
              child: AssistantAttachmentPreview(attachment: widget.attachment),
            ),
          ),
          IconButton(
            tooltip: '$deleteLabel: ${widget.attachment.name}',
            constraints: const BoxConstraints.tightFor(width: 44, height: 44),
            icon: const Icon(Icons.close_rounded),
            onPressed: () {
              Navigator.of(context).pop();
              unawaited(widget.onRemove(widget.attachment.id));
            },
          ),
        ],
      ),
    );
  }
}
