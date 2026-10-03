import 'package:flutter/material.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/features/settings/view/offline_changes_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

/// Tombstones stay reviewable after the optimistic catalog overlay removes
/// rows.
class InventoryPendingDeletions extends StatelessWidget {
  const InventoryPendingDeletions({
    required this.userId,
    required this.workspaceId,
    this.names = const {},
    super.key,
  });

  final String? userId;
  final String? workspaceId;
  final Map<String, String> names;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder(
    valueListenable: OfflineMutationQueue.instance.pending,
    builder: (context, records, _) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final record in records.where(
          (m) =>
              userId != null &&
              m.userId == userId &&
              workspaceId != null &&
              m.workspaceId == workspaceId &&
              m.feature == 'inventory' &&
              m.method == 'DELETE' &&
              m.path.contains('/products/') &&
              m.entityId != null,
        ))
          PendingSyncFrame(
            workspaceId: workspaceId!,
            entityId: record.entityId!,
            feature: 'inventory',
            child: ListTile(
              minVerticalPadding: 12,
              leading: const Icon(Icons.delete_outline),
              title: Text(
                names[record.entityId] ??
                    context.l10n.inventoryRedesignPendingDeletion,
              ),
              subtitle: Text(context.l10n.inventoryRedesignPendingDeletion),
              trailing: IconButton(
                tooltip: context.l10n.offlineChangesTitle,
                icon: const Icon(Icons.info_outline),
                onPressed: () => showOfflineChangesSheet(context),
              ),
            ),
          ),
      ],
    ),
  );
}
