part of 'inventory_repository.dart';

({List<InventorySaleSummary> data, int count, bool realtimeEnabled})
_overlayPendingInventorySales(
  String wsId,
  ({List<InventorySaleSummary> data, int count, bool realtimeEnabled})
  confirmed, {
  String? periodId,
  bool includeCreates = true,
  List<PendingMutationRecord>? pending,
}) {
  final rows = {for (final sale in confirmed.data) sale.id: sale};
  final originalIds = rows.keys.toSet();
  final edits = (pending ?? OfflineMutationQueue.instance.pending.value).where(
    (edit) => edit.feature == 'inventory' && edit.workspaceId == wsId,
  );
  final assignedPeriods = <String, String?>{};
  for (final edit in edits) {
    if (edit.method == 'PUT' && edit.path.endsWith('/period')) {
      final saleId = edit.entityId;
      if (saleId != null) {
        assignedPeriods[saleId] = edit.payload?['period_id'] as String?;
      }
    }
  }
  for (final edit in edits) {
    final saleId = edit.entityId;
    if (saleId == null) continue;
    final payload = edit.payload ?? const <String, dynamic>{};
    if (includeCreates &&
        edit.method == 'POST' &&
        edit.path == InventoryEndpoints.invoices(wsId)) {
      final assigned = assignedPeriods[saleId];
      if (periodId != null && assigned != periodId) continue;
      final products = payload['products'] as List<dynamic>? ?? const [];
      rows[saleId] = InventorySaleSummary(
        id: saleId,
        notice: payload['content'] as String?,
        paidAmount: 0,
        itemsCount: products.length,
        totalQuantity: 0,
        owners: const [],
        source: 'finance_invoice',
        createdAt: edit.createdAt,
      );
    } else if (edit.method == 'PUT' &&
        edit.path == InventoryEndpoints.sale(wsId, saleId)) {
      final previous = rows[saleId];
      if (previous == null) continue;
      rows[saleId] = InventorySaleSummary(
        id: saleId,
        notice: payload['notice'] as String?,
        paidAmount: previous.paidAmount,
        itemsCount: previous.itemsCount,
        totalQuantity: previous.totalQuantity,
        owners: previous.owners,
        source: previous.source,
        createdAt: previous.createdAt,
        completedAt: previous.completedAt,
        walletName: previous.walletName,
        categoryName: previous.categoryName,
        customerName: previous.customerName,
        creatorName: previous.creatorName,
        currency: previous.currency,
        period: previous.period,
      );
    } else if (edit.method == 'DELETE' &&
        edit.path == InventoryEndpoints.sale(wsId, saleId)) {
      rows.remove(saleId);
    }
  }
  return (
    data: rows.values.toList(growable: false),
    count:
        confirmed.count +
        rows.keys.where((id) => !originalIds.contains(id)).length -
        originalIds.where((id) => !rows.containsKey(id)).length,
    realtimeEnabled: confirmed.realtimeEnabled,
  );
}
