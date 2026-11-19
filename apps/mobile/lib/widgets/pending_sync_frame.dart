import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/ui.dart'
    show AppButton, AppButtonSize, AppTokens;
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_outline_painter.dart';

/// Makes a local edit distinguishable from a server-confirmed item: the item
/// is dimmed under a muted dashed outline, with its sync status below.
class PendingSyncFrame extends StatelessWidget {
  const PendingSyncFrame({
    required this.workspaceId,
    required this.entityId,
    required this.child,
    this.feature,
    this.notificationWorkspaceId,
    this.relatedEntityIds = const [],
    this.borderRadius,
    super.key,
  });

  final String workspaceId;
  final String entityId;
  final String? feature;
  final String? notificationWorkspaceId;
  final List<String> relatedEntityIds;
  final Widget child;

  /// Corners of [child], so the outline stays concentric with them. Defaults
  /// to the card radius.
  final BorderRadius? borderRadius;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: Listenable.merge([
      OfflineMutationQueue.instance.pending,
      OfflineMutationQueue.instance.syncingIds,
    ]),
    builder: (context, _) {
      final records = OfflineMutationQueue.instance.pending.value;
      PendingMutationRecord? mutation;
      for (final record in records) {
        if ((record.workspaceId != workspaceId &&
                record.feature != 'notifications') ||
            (feature != null && record.feature != feature)) {
          continue;
        }
        if (record.entityId == entityId ||
            relatedEntityIds.contains(record.entityId) ||
            (record.isBulkNotificationRead &&
                (record.payload?['wsId'] == null ||
                    record.payload?['wsId'] == notificationWorkspaceId)) ||
            (record.feature == 'tasks' &&
                record.path.endsWith('/tasks/bulk') &&
                (record.payload?['taskIds'] as List?)?.contains(entityId) ==
                    true) ||
            record.payload?['client_destination_transaction_id'] == entityId ||
            Uri.tryParse(record.path)?.pathSegments.contains(entityId) ==
                true) {
          mutation ??= record;
          if (OfflineMutationQueue.instance.syncingIds.value.contains(
            record.id,
          )) {
            mutation = record;
            break;
          }
        }
      }
      if (mutation == null) return child;
      final status = mutation.status;
      final retryId =
          feature == 'notifications' &&
              mutation.canRetry &&
              !OfflineMutationQueue.instance.syncingIds.value.contains(
                mutation.id,
              )
          ? mutation.id
          : null;
      final colors = AppTokens.of(context).colorScheme;
      final label = switch (status) {
        PendingMutationStatus.queued =>
          OfflineMutationQueue.instance.syncingIds.value.contains(mutation.id)
              ? context.l10n.offlineEditSyncing
              : context.l10n.offlineEditQueued,
        PendingMutationStatus.conflict => context.l10n.offlineEditConflict,
        PendingMutationStatus.failed => context.l10n.offlineEditFailed,
      };
      return Semantics(
        label: retryId == null ? label : null,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            CustomPaint(
              foregroundPainter: PendingSyncOutlinePainter(
                color: PendingSyncOutlinePainter.colorFor(colors, status),
                outerRadius:
                    borderRadius ??
                    BorderRadius.circular(AppTokens.of(context).shapes.card),
              ),
              child: Opacity(opacity: 0.64, child: child),
            ),
            if (retryId != null)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: AppButton.ghost(
                  size: AppButtonSize.small,
                  onPressed: () => unawaited(
                    OfflineMutationQueue.instance.retryFromView(retryId),
                  ),
                  child: Text(
                    status == PendingMutationStatus.queued
                        ? context.l10n.notificationsRetryPendingSync
                        : context.l10n.notificationsRetryFailedSync,
                  ),
                ),
              )
            else
              ExcludeSemantics(
                child: Padding(
                  padding: const EdgeInsetsDirectional.fromSTEB(
                    AppSpacing.md,
                    AppSpacing.xs,
                    AppSpacing.md,
                    AppSpacing.xs,
                  ),
                  child: Text(
                    label,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: status == PendingMutationStatus.queued
                          ? colors.mutedForeground
                          : colors.destructive,
                    ),
                  ),
                ),
              ),
          ],
        ),
      );
    },
  );
}
