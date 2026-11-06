import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_attachment_preview.dart';

/// Draft previews stay above the prompt; their upload ownership stays external.
class AssistantComposerAttachments extends StatelessWidget {
  const AssistantComposerAttachments({
    required this.attachments,
    required this.onRemove,
    this.onRetry,
    super.key,
  });
  final List<AssistantAttachment> attachments;
  final Future<void> Function(String)? onRemove;
  final Future<void> Function(String)? onRetry;
  @override
  Widget build(BuildContext context) => ConstrainedBox(
    constraints: const BoxConstraints(maxHeight: 100),
    child: SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      child: Wrap(
        spacing: 8,
        runSpacing: 4,
        children: [
          for (final attachment in attachments)
            AssistantAttachmentPreview(
              key: ValueKey(attachment.id),
              attachment: attachment,
              onRemove: onRemove == null
                  ? null
                  : () => unawaited(onRemove!(attachment.id)),
              onRetry: onRetry == null
                  ? null
                  : () => unawaited(onRetry!(attachment.id)),
            ),
        ],
      ),
    ),
  );
}
