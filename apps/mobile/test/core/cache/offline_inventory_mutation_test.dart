import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_inventory_mutation.dart';
import 'package:mobile/core/cache/offline_resource_reference.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';

PendingMutationRecord record({
  String path = '/api/v1/workspaces/ws/products',
  String feature = 'inventory',
  String method = 'POST',
  String entityId = 'local-product',
  Map<String, dynamic>? payload,
}) => PendingMutationRecord(
  id: 'operation',
  feature: feature,
  method: method,
  path: path,
  createdAt: DateTime.utc(2026),
  userId: 'actor',
  workspaceId: 'ws',
  optimisticPatch: {'entityId': entityId},
  payload: payload,
);

OfflineResourceReference ref(
  String kind,
  String id, {
  String? userId,
  String workspaceId = 'ws',
}) => OfflineResourceReference(
  userId: userId ?? 'actor',
  workspaceId: workspaceId,
  feature: kind == 'finance_category' || kind == 'wallet'
      ? 'finance'
      : 'inventory',
  resource: kind == 'finance_category' ? 'category' : kind,
  localId: id,
);

void main() {
  test('batch checkpoints stay outside the inventory wallet scheduler', () {
    expect(
      OfflineInventoryMutation.fromRecord(
        record(
          path: '/api/workspaces/ws/wallets/checkpoints',
          feature: 'finance',
        ),
      ),
      isNull,
    );
    expect(
      OfflineInventoryMutation.fromRecord(
        record(
          path: '/api/workspaces/ws/wallets/local-wallet',
          feature: 'finance',
          method: 'PATCH',
        ),
      )?.resource,
      'wallet',
    );
  });

  test(
    'entity/workspace ID collision rewrites only the declared entity slot',
    () {
      final mutation = OfflineInventoryMutation.fromRecord(
        record(
          path: '/api/v1/workspaces/ws/products/ws?cursor=ws',
          method: 'PATCH',
          entityId: 'ws',
        ),
      )!;
      final result = mutation.resolve({ref('product', 'ws'): 'server-product'});
      expect(
        result.path,
        '/api/v1/workspaces/ws/products/server-product?cursor=ws',
      );
    },
  );

  test('all six setup references and revenue partner are explicitly typed', () {
    final mutation = OfflineInventoryMutation.fromRecord(
      record(
        payload: {
          'id': 'local-product',
          'name': 'category-local',
          'description': 'owner-local',
          'category_id': 'category-local',
          'owner_id': 'owner-local',
          'manufacturer_id': 'manufacturer-local',
          'finance_category_id': 'finance-local',
          'inventory': [
            {
              'unit_id': 'unit-local',
              'warehouse_id': 'warehouse-local',
              'revenue_share_partner_id': 'partner-local',
            },
          ],
        },
      ),
    )!;
    expect(mutation.references, {
      ref('category', 'category-local'),
      ref('owner', 'owner-local'),
      ref('manufacturer', 'manufacturer-local'),
      ref('finance_category', 'finance-local'),
      ref('unit', 'unit-local'),
      ref('warehouse', 'warehouse-local'),
      ref('owner', 'partner-local'),
    });
    expect(mutation.node.produces, ref('product', 'local-product'));
    expect(mutation.references, isNot(contains(mutation.identity)));
  });

  test(
    'typed mappings cannot overwrite same-valued IDs in other resources',
    () {
      final mutation = OfflineInventoryMutation.fromRecord(
        record(
          payload: {
            'name': 'same',
            'description': 'same',
            'category_id': 'same',
            'owner_id': 'same',
            'finance_category_id': 'same',
            'inventory': [
              {'unit_id': 'same', 'warehouse_id': 'same'},
            ],
          },
        ),
      )!;
      final resolved = mutation.resolve({
        ref('category', 'same'): 'category-server',
        ref('owner', 'same'): 'owner-server',
        ref('finance_category', 'same'): 'finance-server',
        ref('unit', 'same'): 'unit-server',
        ref('warehouse', 'same'): 'warehouse-server',
      }).payload!;
      expect(resolved['category_id'], 'category-server');
      expect(resolved['owner_id'], 'owner-server');
      expect(resolved['finance_category_id'], 'finance-server');
      expect(resolved['inventory'], [
        {'unit_id': 'unit-server', 'warehouse_id': 'warehouse-server'},
      ]);
      expect(resolved['name'], 'same');
      expect(resolved['description'], 'same');
      expect(mutation.record.payload!['category_id'], 'same');
    },
  );

  test(
    'mapping ignores other accounts/workspaces and preserves absent/null fields',
    () {
      final mutation = OfflineInventoryMutation.fromRecord(
        record(payload: {'category_id': 'local', 'manufacturer_id': null}),
      )!;
      final resolved = mutation.resolve({
        ref('category', 'local', userId: 'other'): 'wrong-account',
        ref('category', 'local', workspaceId: 'other'): 'wrong-workspace',
      }).payload!;
      expect(resolved, {'category_id': 'local', 'manufacturer_id': null});
      expect(resolved.containsKey('owner_id'), isFalse);
      expect(resolved.containsKey('finance_category_id'), isFalse);
    },
  );

  test('edit targets derive from resource path rather than '
      'incidental entity patch', () {
    final mutation = OfflineInventoryMutation.fromRecord(
      record(
        path:
            '/api/v1/workspaces/ws/inventory/sales-periods/local-period/prices',
        entityId: 'price-helper-id',
        payload: {
          'prices': [
            {
              'product_id': 'local-product',
              'unit_id': 'local-unit',
              'warehouse_id': 'local-warehouse',
              'price': 123,
            },
          ],
        },
      ),
    )!;
    expect(mutation.isCreate, isFalse);
    expect(mutation.identity, ref('period', 'local-period'));
    expect(mutation.references, contains(ref('period', 'local-period')));
    final result = mutation.resolve({
      ref('period', 'local-period'): 'period-server',
      ref('product', 'local-product'): 'product-server',
      ref('unit', 'local-unit'): 'unit-server',
      ref('warehouse', 'local-warehouse'): 'warehouse-server',
    });
    expect(
      result.path,
      '/api/v1/workspaces/ws/inventory/sales-periods/period-server/prices',
    );
    expect(result.payload!['prices'], [
      {
        'product_id': 'product-server',
        'unit_id': 'unit-server',
        'warehouse_id': 'warehouse-server',
        'price': 123,
      },
    ]);
  });

  test(
    'period creates depend on products without depending on their own ID',
    () {
      final mutation = OfflineInventoryMutation.fromRecord(
        record(
          path: '/api/v1/workspaces/ws/inventory/sales-periods',
          entityId: 'local-period',
          payload: {
            'id': 'local-period',
            'product_ids': ['local-product'],
          },
        ),
      )!;
      expect(mutation.references, {ref('product', 'local-product')});
      expect(mutation.node.produces, ref('period', 'local-period'));
      expect(
        mutation.resolve({
          ref('product', 'local-product'): 'product-server',
        }).payload!['product_ids'],
        ['product-server'],
      );
    },
  );

  test('sale depends on stock, wallet, Finance category and period', () {
    final mutation = OfflineInventoryMutation.fromRecord(
      record(
        path: '/api/v1/workspaces/ws/finance/invoices',
        entityId: 'sale-request',
        payload: {
          'wallet_id': 'wallet',
          'category_id': 'finance-category',
          'inventory_period_id': 'period',
          'inventory_request_id': 'sale-request',
          'products': [
            {
              'product_id': 'product',
              'unit_id': 'unit',
              'warehouse_id': 'warehouse',
            },
          ],
        },
      ),
    )!;
    expect(mutation.references, {
      ref('wallet', 'wallet'),
      ref('finance_category', 'finance-category'),
      ref('period', 'period'),
      ref('product', 'product'),
      ref('unit', 'unit'),
      ref('warehouse', 'warehouse'),
    });
    expect(mutation.usesCreateContract, isFalse);
  });

  test(
    'Finance categories share stable typed identity with Inventory consumer',
    () {
      final mutation = OfflineInventoryMutation.fromRecord(
        record(
          path: '/api/workspaces/ws/transactions/categories',
          feature: 'finance',
          entityId: 'category-local',
          payload: {'name': 'Synthetic', 'is_expense': false},
        ),
      )!;
      expect(mutation.node.produces, ref('finance_category', 'category-local'));
      expect(mutation.usesCreateContract, isTrue);
    },
  );

  test(
    'unsupported routes and mismatched workspace stay outside typed scheduler',
    () {
      expect(
        OfflineInventoryMutation.fromRecord(
          record(path: '/api/v1/workspaces/ws/products/product/bundles'),
        ),
        isNull,
      );
      expect(
        OfflineInventoryMutation.fromRecord(
          record(path: '/api/v1/workspaces/other/products'),
        ),
        isNull,
      );
    },
  );

  test(
    'durable required references and acknowledgment survive serialization',
    () {
      final original = record().copyWith(
        requiredReferences: {ref('category', 'local')},
        acknowledgedServerId: 'server-product',
        dependencyIssue: OfflineDependencyIssue.waiting,
      );
      final restored = PendingMutationRecord.fromJson(original.toJson());
      expect(restored.requiredReferences, original.requiredReferences);
      expect(restored.acknowledgedServerId, 'server-product');
      expect(restored.dependencyIssue, OfflineDependencyIssue.waiting);
      expect(
        restored.copyWith(clearDependencyIssue: true).dependencyIssue,
        isNull,
      );
      expect(restored.toJson(), original.toJson());
    },
  );

  test('old serialized records retain backward compatible defaults', () {
    final json = record().toJson()
      ..remove('requiredReferences')
      ..remove('acknowledgedServerId')
      ..remove('dependencyIssue');
    final restored = PendingMutationRecord.fromJson(json);
    expect(restored.requiredReferences, isEmpty);
    expect(restored.acknowledgedServerId, isNull);
    expect(restored.dependencyIssue, isNull);
  });
}
