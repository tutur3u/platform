import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';

List<InventoryProduct> overlayPendingProducts(
  String workspaceId,
  List<InventoryProduct> source,
  List<PendingMutationRecord> pending, {
  String? query,
  bool includeCreates = true,
}) {
  final rows = {for (final product in source) product.id: product};
  for (final mutation in pending) {
    if (mutation.feature != 'inventory' ||
        mutation.workspaceId != workspaceId ||
        !mutation.path.contains('/products')) {
      continue;
    }
    final id = mutation.entityId;
    final payload = mutation.payload;
    if (id == null || payload == null) continue;
    if (mutation.method == 'POST' && !includeCreates) continue;
    final previous = rows[id];
    if (mutation.method == 'PATCH' && previous == null) continue;
    final product = InventoryProduct.fromJson({
      'id': id,
      'name': payload['name'] ?? previous?.name,
      'category_id': payload['category_id'] ?? previous?.categoryId,
      'owner_id': payload['owner_id'] ?? previous?.ownerId,
      'manufacturer_id': payload['manufacturer_id'] ?? previous?.manufacturerId,
      'manufacturer': previous?.manufacturer,
      'description': payload['description'] ?? previous?.description,
      'usage': payload['usage'] ?? previous?.usage,
      'category': previous?.category,
      'finance_category_id':
          payload['finance_category_id'] ?? previous?.financeCategoryId,
      'ws_id': workspaceId,
      'created_at':
          previous?.createdAt?.toIso8601String() ??
          mutation.createdAt.toIso8601String(),
      'inventory':
          payload['inventory'] ??
          previous?.inventory
              .map(
                (row) => {
                  'unit_id': row.unitId,
                  'warehouse_id': row.warehouseId,
                  'amount': row.amount,
                  'min_amount': row.minAmount,
                  'price': row.price,
                  'unit_name': row.unitName,
                  'warehouse_name': row.warehouseName,
                },
              )
              .toList() ??
          const <Map<String, dynamic>>[],
    });
    if (query != null &&
        query.isNotEmpty &&
        !(product.name ?? '').toLowerCase().contains(query.toLowerCase())) {
      rows.remove(id);
    } else {
      rows[id] = product;
    }
  }
  return rows.values.toList(growable: false);
}
