import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../helpers/offline_inventory_harness.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'successful setup replay survives restart and maps a stale editor once',
    () async {
      final api = _Api();
      final harness = await OfflineInventoryHarness.create(api, online: false);
      var online = false;
      OfflineMutationQueue makeQueue() => OfflineMutationQueue.forTesting(
        store: harness.store,
        userId: () => 'actor',
        checkConnectivity: () async => [
          if (online) ConnectivityResult.wifi else ConnectivityResult.none,
        ],
        connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
        authChanges: const Stream<supa.AuthState>.empty(),
        apiFactory: (_) => api,
      );
      var queue = makeQueue();
      await queue.init();
      InventoryRepository repository() => InventoryRepository(
        apiClient: api,
        cacheStore: harness.store,
        mutationQueue: queue,
        cacheUserId: () => 'actor',
        networkAvailable: () async => online,
      );
      final creates = <String>[];
      const serverCategory = '11111111-1111-4111-8111-111111111111';
      const serverWarehouse = '22222222-2222-4222-8222-222222222222';
      when(() => api.postJson(any(), any())).thenAnswer((call) async {
        expect(
          call.positionalArguments.first,
          '/api/v1/workspaces/ws/inventory/offline-mutations',
        );
        final body = call.positionalArguments[1] as Map<String, dynamic>;
        final kind = body['kind'] as String;
        creates.add(kind);
        return {
          'contract': 'inventory-offline-create-v1',
          'resource': kind,
          'data': {'id': kind == 'category' ? serverCategory : serverWarehouse},
        };
      });
      final edits = <Map<String, dynamic>>[];
      when(() => api.patchJson(any(), any())).thenAnswer((call) async {
        expect(
          call.positionalArguments.first,
          '/api/v1/workspaces/ws/products/confirmed',
        );
        final payload = call.positionalArguments[1] as Map<String, dynamic>;
        expect(payload['category_id'], serverCategory);
        expect(
          ((payload['inventory'] as List).single as Map)['warehouse_id'],
          serverWarehouse,
        );
        edits.add(payload);
        return {
          'data': {'id': 'confirmed'},
        };
      });
      try {
        for (final kind in ['category', 'warehouse']) {
          await queueOrSendVoid(
            queue: queue,
            apiClient: api,
            feature: 'inventory',
            method: 'POST',
            workspaceId: 'ws',
            entityId: 'local-$kind',
            path:
                '/api/v1/workspaces/ws/product-${kind == 'category' ? 'categories' : 'warehouses'}',
            payload: {'name': 'Local $kind'},
            send: () async => throw StateError('No legacy create'),
          );
        }
        expect(await queue.listPending(), hasLength(2));
        verifyNever(() => api.postJson(any(), any()));
        verifyNever(() => api.patchJson(any(), any()));
        online = true;
        await queue.drain();
        expect(creates, ['category', 'warehouse']);
        expect(await queue.listPending(), isEmpty);
        await queue.dispose();
        queue = makeQueue();
        await queue.init();
        final repo = repository();
        try {
          await repo.updateProduct(
            wsId: 'ws',
            productId: 'confirmed',
            name: 'Retained editor changes',
            categoryId: 'local-category',
            ownerId: 'confirmed-owner',
            inventory: const [
              InventoryStockEntry(
                unitId: 'confirmed-unit',
                warehouseId: 'local-warehouse',
                amount: 2,
                minAmount: 0,
                price: 3,
              ),
            ],
          );
          expect(edits.single['name'], 'Retained editor changes');
          expect(
            ((edits.single['inventory'] as List).single as Map)['amount'],
            2,
          );
          expect(creates, ['category', 'warehouse']);
          expect(await queue.listPending(), isEmpty);
          await queue.drain();
          expect(edits, hasLength(1));
          expect(creates, hasLength(2));
        } finally {
          repo.dispose();
        }
      } finally {
        await queue.dispose();
        await harness.dispose();
      }
    },
  );
}
