import 'dart:async';

import 'package:flutter/material.dart';
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
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;

    final duration = request.duration;
    final durationText = _formatDuration(duration);

    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.85,
      builder: (context, scrollController) => Container(
        decoration: BoxDecoration(
          color: colorScheme.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: ListView(
          controller: scrollController,
          padding: const EdgeInsets.all(24),
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: colorScheme.onSurfaceVariant.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Text(
                    request.title ?? 'Request',
                    style: textTheme.titleLarge,
                  ),
                ),
                _StatusBadge(status: request.approvalStatus),
              ],
            ),
            if (request.description != null) ...[
              const SizedBox(height: 12),
              Text(
                request.description!,
                style: textTheme.bodyMedium?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                ),
              ),
            ],
            const SizedBox(height: 16),
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
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: colorScheme.errorContainer.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  request.rejectionReason!,
                  style: textTheme.bodySmall?.copyWith(
                    color: colorScheme.error,
                  ),
                ),
              ),
            ],
            if (request.needsInfoReason != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: colorScheme.tertiaryContainer.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  request.needsInfoReason!,
                  style: textTheme.bodySmall?.copyWith(
                    color: colorScheme.tertiary,
                  ),
                ),
              ),
            ],
            if (isManager &&
                request.approvalStatus == ApprovalStatus.pending) ...[
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed: () {
                        onApprove();
                        Navigator.of(context).pop();
                      },
                      child: Text(l10n.timerApprove),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _showReasonDialog(
                        context,
                        l10n.timerReject,
                        onReject,
                      ),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: colorScheme.error,
                      ),
                      child: Text(l10n.timerReject),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              OutlinedButton(
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
      showDialog<void>(
        context: context,
        builder: (dialogCtx) => Center(
          child: SizedBox(
            width: MediaQuery.of(context).size.width * 0.8,
            child: shad.AlertDialog(
              barrierColor: Colors.transparent,
              title: Text(title),
              content: TextField(
                controller: controller,
                maxLines: 3,
                decoration: const InputDecoration(
                  hintText: 'Reason (optional)',
                  border: OutlineInputBorder(),
                ),
              ),
              actions: [
                shad.OutlineButton(
                  onPressed: () => Navigator.of(dialogCtx).pop(),
                  child: Text(
                    MaterialLocalizations.of(dialogCtx).cancelButtonLabel,
                  ),
                ),
                shad.PrimaryButton(
                  onPressed: () {
                    final reason = controller.text.isEmpty
                        ? null
                        : controller.text;
                    onSubmit(reason);
                    Navigator.of(dialogCtx).pop();
                    Navigator.of(context).pop();
                  },
                  child: Text(title),
                ),
              ],
            ),
          ),
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
    final colorScheme = Theme.of(context).colorScheme;

    final (label, color) = switch (status) {
      ApprovalStatus.pending => ('Pending', colorScheme.tertiary),
      ApprovalStatus.approved => ('Approved', colorScheme.primary),
      ApprovalStatus.rejected => ('Rejected', colorScheme.error),
      ApprovalStatus.needsInfo => ('Needs info', colorScheme.secondary),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
