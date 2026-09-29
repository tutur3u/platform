import 'package:flutter/material.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/l10n/l10n.dart';

/// Makes a local edit distinguishable from a server-confirmed item.
class PendingSyncFrame extends StatelessWidget {
  const PendingSyncFrame({
    required this.workspaceId,
    required this.entityId,
    required this.child,
    this.feature,
    super.key,
  });

  final String workspaceId;
  final String entityId;
  final String? feature;
  final Widget child;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder(
    valueListenable: OfflineMutationQueue.instance.pending,
    builder: (context, records, _) {
      PendingMutationRecord? mutation;
      for (final record in records) {
        if (record.workspaceId != workspaceId ||
            (feature != null && record.feature != feature)) {
          continue;
        }
        if (record.entityId == entityId ||
            (record.feature == 'tasks' &&
                record.path.endsWith('/tasks/bulk') &&
                (record.payload?['taskIds'] as List?)?.contains(entityId) ==
                    true) ||
            record.payload?['client_destination_transaction_id'] == entityId ||
            Uri.tryParse(record.path)?.pathSegments.contains(entityId) ==
                true) {
          mutation = record;
          break;
        }
      }
      if (mutation == null) return child;
      final status = mutation.status;
      final color = switch (status) {
        PendingMutationStatus.queued => Theme.of(context).colorScheme.primary,
        PendingMutationStatus.conflict => Theme.of(context).colorScheme.error,
        PendingMutationStatus.failed => Theme.of(context).colorScheme.error,
      };
      final label = switch (status) {
        PendingMutationStatus.queued => context.l10n.offlineEditQueued,
        PendingMutationStatus.conflict => context.l10n.offlineEditConflict,
        PendingMutationStatus.failed => context.l10n.offlineEditFailed,
      };
      return Semantics(
        label: label,
        child: CustomPaint(
          foregroundPainter: _DashedBorderPainter(color),
          child: Opacity(
            opacity: 0.64,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                child,
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
                  child: Text(
                    label,
                    style: Theme.of(
                      context,
                    ).textTheme.labelSmall?.copyWith(color: color),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

class _DashedBorderPainter extends CustomPainter {
  const _DashedBorderPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(12)),
      );
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    for (final metric in path.computeMetrics()) {
      for (var distance = 0.0; distance < metric.length; distance += 10) {
        canvas.drawPath(
          metric.extractPath(distance, (distance + 5).clamp(0, metric.length)),
          paint,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedBorderPainter oldDelegate) =>
      oldDelegate.color != color;
}
