import 'dart:async';

import 'package:flutter/material.dart'
    hide AlertDialog, FilledButton, OutlinedButton, TextField;
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class RequestDetailSheet extends StatelessWidget {
  const RequestDetailSheet({
    required this.request,
    required this.onApprove,
    required this.onReject,
    required this.onRequestInfo,
    this.isManager = false,
    super.key,
  });

  final TimeTrackingRequest request;
  final VoidCallback onApprove;
  final ValueChanged<String?> onReject;
  final ValueChanged<String?> onRequestInfo;
  final bool isManager;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    final duration = request.duration;
    final durationText = _formatDuration(duration);

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.background,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: theme.colorScheme.mutedForeground.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const shad.Gap(16),
          Row(
            children: [
              Expanded(
                child: Text(
                  request.title ?? 'Request',
                  style: theme.typography.h3,
                ),
              ),
              _StatusBadge(status: request.approvalStatus),
            ],
          ),
          if (request.description != null) ...[
            const shad.Gap(12),
            Text(
              request.description!,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          ],
          const shad.Gap(16),
          _InfoRow(
            label: l10n.timerDuration,
            value: durationText,
          ),
          if (request.startTime != null)
            _InfoRow(
              label: l10n.timerStartTime,
              value: _formatDateTime(request.startTime!),
            ),
          if (request.endTime != null)
            _InfoRow(
              label: l10n.timerEndTime,
              value: _formatDateTime(request.endTime!),
            ),
          if (request.rejectionReason != null) ...[
            const shad.Gap(12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.destructive.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                request.rejectionReason!,
                style: theme.typography.small.copyWith(
                  color: theme.colorScheme.destructive,
                ),
              ),
            ),
          ],
          if (request.needsInfoReason != null) ...[
            const shad.Gap(12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.secondary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                request.needsInfoReason!,
                style: theme.typography.small.copyWith(
                  color: theme.colorScheme.secondary,
                ),
              ),
            ),
          ],
          if (isManager &&
              request.approvalStatus == ApprovalStatus.pending) ...[
            const shad.Gap(24),
            Row(
              children: [
                Expanded(
                  child: shad.PrimaryButton(
                    onPressed: () {
                      onApprove();
                      Navigator.of(context).pop();
                    },
                    child: Text(l10n.timerApprove),
                  ),
                ),
                const shad.Gap(8),
                Expanded(
                  child: shad.DestructiveButton(
                    onPressed: () => _showReasonDialog(
                      context,
                      l10n.timerReject,
                      onReject,
                    ),
                    child: Text(l10n.timerReject),
                  ),
                ),
              ],
            ),
            const shad.Gap(8),
            shad.OutlineButton(
              onPressed: () => _showReasonDialog(
                context,
                l10n.timerRequestInfo,
                onRequestInfo,
              ),
              child: Text(l10n.timerRequestInfo),
            ),
          ],
        ],
      ),
    );
  }

  void _showReasonDialog(
    BuildContext context,
    String title,
    ValueChanged<String?> onSubmit,
  ) {
    final controller = TextEditingController();
    unawaited(
      shad.showDialog<void>(
        context: context,
        builder: (dialogCtx) => shad.AlertDialog(
          title: Text(title),
          content: shad.TextField(
            controller: controller,
            maxLines: 3,
            placeholder: Text(context.l10n.timerReasonOptional),
          ),
          actions: [
            shad.OutlineButton(
              onPressed: () => Navigator.of(dialogCtx).pop(),
              child: const Text('Cancel'),
            ),
            shad.PrimaryButton(
              onPressed: () {
                final reason = controller.text.isEmpty ? null : controller.text;
                onSubmit(reason);
                Navigator.of(dialogCtx).pop();
                if (!context.mounted) return;
                Navigator.of(context).pop();
              },
              child: Text(title),
            ),
          ],
        ),
      ),
    );
  }

  String _formatDuration(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes % 60;
    if (h > 0) return '${h}h ${m}m';
    return '${m}m';
  }

  String _formatDateTime(DateTime dt) {
    final local = dt.toLocal();
    return '${local.month}/${local.day} '
        '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final ApprovalStatus status;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    final (label, color) = switch (status) {
      ApprovalStatus.pending => ('Pending', theme.colorScheme.secondary),
      ApprovalStatus.approved => ('Approved', theme.colorScheme.primary),
      ApprovalStatus.rejected => ('Rejected', theme.colorScheme.destructive),
      ApprovalStatus.needsInfo => (
        'Needs info',
        theme.colorScheme.mutedForeground,
      ),
    };

    return shad.OutlineBadge(
      child: Text(
        label,
        style: theme.typography.small.copyWith(
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          Text(
            value,
            style: theme.typography.small.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
