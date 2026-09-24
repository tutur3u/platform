import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/widgets/assistant_markdown_body.dart';
import 'package:mobile/features/meet/data/meet_room_assistant.dart';
import 'package:mobile/l10n/l10n.dart';

class MeetAssistantReviewCard extends StatefulWidget {
  const MeetAssistantReviewCard({
    required this.assistant,
    required this.review,
    super.key,
  });

  final MeetRoomAssistant assistant;
  final Map<String, dynamic> review;

  @override
  State<MeetAssistantReviewCard> createState() =>
      _MeetAssistantReviewCardState();
}

class _MeetAssistantReviewCardState extends State<MeetAssistantReviewCard> {
  bool _busy = false;
  bool _failed = false;

  Future<void> _decide(String action) async {
    if (_busy) return;
    final l10n = context.l10n;
    if (action == 'approve' || action == 'share') {
      final accepted = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(
            action == 'approve'
                ? l10n.meetMiraApprovalTitle
                : l10n.meetShareWithEveryone,
          ),
          content: Text(
            action == 'approve'
                ? l10n.meetMiraApprovalHint
                : l10n.meetShareHint,
          ),
          actions: [
            TextButton.icon(
              onPressed: () => Navigator.pop(dialogContext, false),
              icon: const Icon(Icons.close),
              label: Text(l10n.commonCancel),
            ),
            FilledButton.icon(
              onPressed: () => Navigator.pop(dialogContext, true),
              icon: Icon(
                action == 'approve'
                    ? Icons.check_circle_outline
                    : Icons.share_outlined,
              ),
              label: Text(
                action == 'approve'
                    ? l10n.meetMiraApprove
                    : l10n.meetShareConfirm,
              ),
            ),
          ],
        ),
      );
      if (accepted != true || !mounted) return;
    }
    final id = widget.review['id'] as String?;
    final revision = widget.review['revision'] as int?;
    if (id == null || revision == null) return;
    setState(() {
      _busy = true;
      _failed = false;
    });
    try {
      await widget.assistant.decide(
        messageId: id,
        revision: revision,
        action: action,
      );
    } on Object {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final review = widget.review;
    final approvals = (review['approvals'] as List? ?? []).whereType<Map>();
    final status = review['status'] as String?;
    final ready = status == 'ready';
    return Card.outlined(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.lock_outline, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    l10n.meetMiraReviews,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              review['workspaceName'] as String? ?? '',
              style: Theme.of(context).textTheme.labelMedium,
            ),
            if ((review['text'] as String? ?? '').isNotEmpty) ...[
              const SizedBox(height: 8),
              AssistantMarkdownBody(data: review['text'] as String),
            ],
            for (final approval in approvals) ...[
              const SizedBox(height: 12),
              Text(
                (approval['toolName'] as String? ?? '').replaceAll('_', ' '),
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 4),
              SelectableText(
                const JsonEncoder.withIndent('  ').convert(approval['input']),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            if (_failed) ...[
              const SizedBox(height: 8),
              Text(
                l10n.meetMiraActionFailed,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            if (_busy) const LinearProgressIndicator(),
            if (ready && !_busy) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                children: approvals.isNotEmpty
                    ? [
                        FilledButton.icon(
                          onPressed: () => unawaited(_decide('approve')),
                          icon: const Icon(Icons.check_circle_outline),
                          label: Text(l10n.meetMiraApprove),
                        ),
                        OutlinedButton.icon(
                          onPressed: () => unawaited(_decide('deny')),
                          icon: const Icon(Icons.block_outlined),
                          label: Text(l10n.meetMiraDeny),
                        ),
                      ]
                    : [
                        FilledButton.icon(
                          onPressed: () => unawaited(_decide('share')),
                          icon: const Icon(Icons.share_outlined),
                          label: Text(l10n.meetShareWithEveryone),
                        ),
                        OutlinedButton.icon(
                          onPressed: () => unawaited(_decide('discard')),
                          icon: const Icon(Icons.delete_outline),
                          label: Text(l10n.meetMiraDiscard),
                        ),
                      ],
              ),
            ],
            if (status == 'interrupted' && !_busy)
              TextButton.icon(
                onPressed: () => unawaited(_decide('discard')),
                icon: const Icon(Icons.delete_outline),
                label: Text(l10n.meetMiraDiscard),
              ),
          ],
        ),
      ),
    );
  }
}
