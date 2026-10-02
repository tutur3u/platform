import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/l10n/l10n.dart';

Future<void> showOfflineChangesSheet(BuildContext context) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _OfflineChangesSheet(),
    );

class _OfflineChangesSheet extends StatelessWidget {
  const _OfflineChangesSheet();

  @override
  Widget build(BuildContext context) {
    final queue = OfflineMutationQueue.instance;
    final l10n = context.l10n;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l10n.offlineChangesTitle,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            ListenableBuilder(
              listenable: Listenable.merge([queue.pending, queue.syncingIds]),
              builder: (context, _) {
                final records = queue.pending.value;
                if (records.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Center(child: Text(l10n.offlineChangesEmpty)),
                  );
                }
                return Flexible(
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: records.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, index) =>
                        _PendingChangeCard(record: records[index]),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _PendingChangeCard extends StatelessWidget {
  const _PendingChangeCard({required this.record});
  final PendingMutationRecord record;

  Future<void> _retry(BuildContext context) async {
    if (record.status == PendingMutationStatus.conflict) {
      unawaited(AppHaptics.warning());
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(dialogContext.l10n.offlineEditConflict),
          content: Text(dialogContext.l10n.offlineChangesReview),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: Text(
                MaterialLocalizations.of(dialogContext).cancelButtonLabel,
              ),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: Text(dialogContext.l10n.offlineChangesRetry),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
    }
    await OfflineMutationQueue.instance.retry(record.id);
    if (!OfflineMutationQueue.instance.pending.value.any(
      (item) => item.id == record.id,
    )) {
      unawaited(AppHaptics.success());
    }
  }

  Future<void> _discard(BuildContext context) async {
    unawaited(AppHaptics.warning());
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(dialogContext.l10n.offlineChangesDiscard),
        content: Text(dialogContext.l10n.offlineChangesDiscardConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(
              MaterialLocalizations.of(dialogContext).cancelButtonLabel,
            ),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(dialogContext.l10n.offlineChangesDiscard),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await OfflineMutationQueue.instance.cancel(record.id);
    unawaited(AppHaptics.drop());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final status = switch (record.status) {
      PendingMutationStatus.queued =>
        OfflineMutationQueue.instance.syncingIds.value.contains(record.id)
            ? l10n.offlineEditSyncing
            : l10n.offlineEditQueued,
      PendingMutationStatus.conflict => l10n.offlineEditConflict,
      PendingMutationStatus.failed => l10n.offlineEditFailed,
    };
    final color = record.status == PendingMutationStatus.queued
        ? Theme.of(context).colorScheme.primary
        : Theme.of(context).colorScheme.error;
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Opacity(
        opacity: 0.72,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                record.feature,
                style: Theme.of(context).textTheme.titleSmall,
              ),
              Text(status, style: TextStyle(color: color)),
              if (record.lastError != null)
                Text(
                  record.lastError!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed:
                        OfflineMutationQueue.instance.syncingIds.value.contains(
                          record.id,
                        )
                        ? null
                        : () => _discard(context),
                    child: Text(l10n.offlineChangesDiscard),
                  ),
                  if (record.status != PendingMutationStatus.queued)
                    TextButton(
                      onPressed: () => _retry(context),
                      child: Text(l10n.offlineChangesRetry),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
