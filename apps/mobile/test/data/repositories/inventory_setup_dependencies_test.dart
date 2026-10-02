import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _SecureStorage extends Mock implements FlutterSecureStorage {}

class _Api extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late OfflineMutationQueue queue;
  late InventoryRepository repository;
  late _Api api;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('inventory-setup-');
    final secure = _SecureStorage();
    final secrets = <String, String>{};
    when(
      () => secure.read(key: any(named: 'key')),
    ).thenAnswer((call) async => secrets[call.namedArguments[#key] as String]);
    when(
      () => secure.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      secrets[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    store = CacheStore.forTesting(
      secureStorage: secure,
      directoryResolver: () async => directory,
    );
    queue = OfflineMutationQueue.forTesting(
      store: store,
      userId: () => 'user',
      checkConnectivity: () async => [ConnectivityResult.none],
      connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
      authChanges: const Stream<supa.AuthState>.empty(),
    );
    await queue.init();
    api = _Api();
    repository = InventoryRepository(
      apiClient: api,
      cacheStore: store,
      mutationQueue: queue,
      cacheUserId: () => 'user',
      networkAvailable: () async => false,
    );
  });

  tearDown(() async {
    repository.dispose();
    await queue.dispose();
    await store.closeForTesting();
    await Hive.close();
    if (directory.existsSync()) directory.deleteSync(recursive: true);
  });

  Future<void> product(
    String category,
    String warehouse, {
    required bool update,
  }) {
    final rows = [
      InventoryStockEntry(
        unitId: 'unit',
        warehouseId: warehouse,
        amount: 1,
        minAmount: 0,
        price: 5,
      ),
    ];
    return update
        ? repository.updateProduct(
            wsId: 'ws',
            productId: 'product',
            name: 'New',
            categoryId: category,
            ownerId: 'owner',
            inventory: rows,
          )
        : repository.createProduct(
            wsId: 'ws',
            name: 'New',
            categoryId: category,
            ownerId: 'owner',
            inventory: rows,
          );
  }

  for (final update in [false, true]) {
    for (final warehouse in [false, true]) {
      test(
        '${update ? 'update' : 'create'} rejects pending '
        '${warehouse ? 'warehouse' : 'category'} before product enqueue',
        () async {
          final path = warehouse
              ? InventoryEndpoints.productWarehouses('ws')
              : InventoryEndpoints.productCategories('ws');
          await queue.enqueueIfOffline(
            feature: 'inventory',
            method: 'POST',
            path: path,
            workspaceId: 'ws',
            entityId: 'local',
            payload: {'name': 'Local'},
          );
          await expectLater(
            product(
              warehouse ? 'category' : 'local',
              warehouse ? 'local' : 'warehouse',
              update: update,
            ),
            throwsA(isA<InventorySetupAwaitingSync>()),
          );
          final pending = await queue.listPending();
          expect(pending, hasLength(1));
          expect(pending.single.path, path);
          verifyNever(() => api.postJson(any(), any()));
          verifyNever(() => api.patchJson(any(), any()));
        },
      );
    }
    test('${update ? 'update' : 'create'} queues reconciled server references '
        'after setup sync', () async {
      for (final kind in ['category', 'warehouse']) {
        await store.saveLocalIdMapping(
          userId: 'user',
          workspaceId: 'ws',
          feature: 'inventory',
          localId: 'local-$kind',
          serverId: 'server-$kind',
        );
      }
      await product('local-category', 'local-warehouse', update: update);
      final pending = await queue.listPending();
      expect(pending, hasLength(1));
      expect(pending.single.payload!['category_id'], 'server-category');
      expect(
        ((pending.single.payload!['inventory'] as List).single
            as Map<String, dynamic>)['warehouse_id'],
        'server-warehouse',
      );
      verifyNever(() => api.postJson(any(), any()));
      verifyNever(() => api.patchJson(any(), any()));
    });
  }
}
