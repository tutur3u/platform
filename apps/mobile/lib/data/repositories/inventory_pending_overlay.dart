import 'package:mobile/core/cache/local_search.dart';
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
    if (id == null) continue;
    if (mutation.method == 'DELETE') {
      rows.remove(id);
      continue;
    }
    if (payload == null) continue;
    if (mutation.method == 'POST' && !includeCreates) continue;
    final previous = rows[id];
    if (mutation.method == 'PATCH' && previous == null) continue;
    final product = InventoryProduct.fromJson({
      'id': id,
      'name': payload['name'] ?? previous?.name,
      'avatar_url': payload.containsKey('avatar_url')
          ? payload['avatar_url']
          : previous?.avatarUrl,
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
      'archived': payload['archived'] ?? previous?.archived ?? false,
      'owner': previous?.owner == null
          ? null
          : {'id': previous!.owner!.id, 'name': previous.owner!.name},
      'created_at':
          previous?.createdAt?.toIso8601String() ??
          mutation.createdAt.toIso8601String(),
      'inventory':
          (payload['inventory'] is List
              ? (payload['inventory'] as List)
                    .whereType<Map<dynamic, dynamic>>()
                    .map((entry) {
                      final row = Map<String, dynamic>.from(entry);
                      row['unit_name'] ??= previous?.inventory
                          .where((known) => known.unitId == row['unit_id'])
                          .firstOrNull
                          ?.unitName;
                      row['warehouse_name'] ??= previous?.inventory
                          .where(
                            (known) => known.warehouseId == row['warehouse_id'],
                          )
                          .firstOrNull
                          ?.warehouseName;
                      return row;
                    })
                    .toList(growable: false)
              : payload['inventory']) ??
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
    if (!inventoryProductMatchesQuery(product, query)) {
      rows.remove(id);
    } else {
      rows[id] = product;
    }
  }
  return rows.values.toList(growable: false);
}

bool inventoryProductMatchesQuery(InventoryProduct product, String? query) {
  return localIlike(product.name, query?.trim() ?? '');
}
