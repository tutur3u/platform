import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';

class NoteMentionTarget {
  const NoteMentionTarget({
    required this.id,
    required this.kind,
    required this.workspaceId,
  });

  final String id;
  final String kind;
  final String workspaceId;
}

class NoteMentionEmbedBuilder extends EmbedBuilder {
  const NoteMentionEmbedBuilder({required this.onOpen});

  final ValueChanged<NoteMentionTarget> onOpen;

  @override
  String get key => 'mention';

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final raw = embedContext.node.value.data;
    if (raw is! String) return const SizedBox.shrink();
    try {
      final attrs = jsonDecode(raw);
      if (attrs is! Map<String, dynamic>) return const SizedBox.shrink();
      final id = attrs['entityId'] as String? ?? '';
      final kind = attrs['entityType'] as String? ?? '';
      final workspaceId = attrs['workspaceId'] as String? ?? '';
      final title = attrs['displayName'] as String? ?? '';
      if (id.isEmpty || title.isEmpty) return const SizedBox.shrink();
      final scheme = Theme.of(context).colorScheme;
      final icon = switch (kind) {
        'task' => Icons.check_circle_outline_rounded,
        'event' => Icons.event_outlined,
        'finance' => Icons.account_balance_wallet_outlined,
        'note' => Icons.note_alt_outlined,
        'meeting' => Icons.video_call_outlined,
        _ => Icons.alternate_email_rounded,
      };
      final chip = Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.7,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15, color: scheme.onSurfaceVariant),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelMedium,
              ),
            ),
          ],
        ),
      );
      if (!embedContext.readOnly) return chip;
      return InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => onOpen(
          NoteMentionTarget(id: id, kind: kind, workspaceId: workspaceId),
        ),
        child: chip,
      );
    } on FormatException {
      return const SizedBox.shrink();
    }
  }
}
