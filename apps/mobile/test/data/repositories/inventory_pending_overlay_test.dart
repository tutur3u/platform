import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/inventory_pending_overlay.dart';

void main() {
  PendingMutationRecord mutation(String method, String id, String name) =>
      PendingMutationRecord(
        id: '$method-$id',
        feature: 'inventory',
        method: method,
        path: '/api/v1/workspaces/ws_1/inventory/products/$id',
        createdAt: DateTime.utc(2026, 9, 28),
        userId: 'user_1',
        workspaceId: 'ws_1',
        payload: {
          'name': name,
          'category_id': 'category_1',
          'owner_id': 'owner_1',
          'inventory': <Object>[],
        },
        optimisticPatch: {'entityId': id},
      );

  test('new product appears only in its workspace and matching search', () {
    final pending = [mutation('POST', 'local_1', 'Offline product')];
    expect(
      overlayPendingProducts(
        'ws_1',
        const [],
        pending,
        query: 'offline',
      ).single.id,
      'local_1',
    );
    expect(overlayPendingProducts('ws_2', const [], pending), isEmpty);
    expect(
      overlayPendingProducts('ws_1', const [], pending, query: 'other'),
      isEmpty,
    );
  });

  test('pending product update replaces the cached row', () {
    const product = InventoryProduct(
      id: 'product_1',
      name: 'Old',
      categoryId: 'category_1',
      ownerId: 'owner_1',
      wsId: 'ws_1',
      inventory: [],
    );
    final result = overlayPendingProducts(
      'ws_1',
      const [product],
      [mutation('PATCH', 'product_1', 'Updated')],
    );
    expect(result.single.name, 'Updated');
  });
}
