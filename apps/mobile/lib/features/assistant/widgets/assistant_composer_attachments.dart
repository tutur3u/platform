import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_attachment_preview.dart';

/// Draft previews stay above the prompt; their upload ownership stays external.
class AssistantComposerAttachments extends StatelessWidget {
  const AssistantComposerAttachments({
    required this.attachments,
    required this.onRemove,
    this.onRetry,
    this.horizontal = false,
    super.key,
  });
  final List<AssistantAttachment> attachments;
  final Future<void> Function(String)? onRemove;
  final Future<void> Function(String)? onRetry;
  final bool horizontal;

  @override
  Widget build(BuildContext context) {
    final previews = [
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
    ];
    if (horizontal) {
      return SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
        child: Row(spacing: AppSpacing.sm, children: previews),
      );
    }
    return ConstrainedBox(
      constraints: const BoxConstraints(maxHeight: 100),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.md,
          AppSpacing.sm,
          AppSpacing.md,
          0,
        ),
        child: Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          children: previews,
        ),
      ),
    );
  }
}
