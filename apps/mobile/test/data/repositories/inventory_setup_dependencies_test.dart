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

  Future<void> product(Map<String, String> refs, {required bool update}) {
    final rows = [
      InventoryStockEntry(
        unitId: refs['unit'] ?? 'unit',
        warehouseId: refs['warehouse'] ?? 'warehouse',
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
            categoryId: refs['category'] ?? 'category',
            ownerId: refs['owner'] ?? 'owner',
            manufacturerId: refs['manufacturer'],
            financeCategoryId: refs['financeCategory'],
            inventory: rows,
          )
        : repository.createProduct(
            wsId: 'ws',
            name: 'New',
            categoryId: refs['category'] ?? 'category',
            ownerId: refs['owner'] ?? 'owner',
            manufacturerId: refs['manufacturer'],
            financeCategoryId: refs['financeCategory'],
            inventory: rows,
          );
  }

  final paths = {
    'category': InventoryEndpoints.productCategories('ws'),
    'warehouse': InventoryEndpoints.productWarehouses('ws'),
    'owner': InventoryEndpoints.owners('ws'),
    'manufacturer': InventoryEndpoints.manufacturers('ws'),
    'unit': InventoryEndpoints.productUnits('ws'),
    'financeCategory': FinanceEndpoints.categories('ws'),
  };
  for (final update in [false, true]) {
    test('${update ? 'update' : 'create'} accepts confirmed references '
        'without optional setup fields', () async {
      await product({}, update: update);
      final payload = (await queue.listPending()).single.payload!;
      expect(payload.containsKey('manufacturer_id'), isTrue);
      expect(payload['manufacturer_id'], isNull);
      expect(payload.containsKey('finance_category_id'), isFalse);
    });
    test(
      '${update ? 'update' : 'create'} keeps mappings feature scoped',
      () async {
        for (final feature in ['inventory', 'finance']) {
          await store.saveLocalIdMapping(
            userId: 'user',
            workspaceId: 'ws',
            feature: feature,
            localId: 'shared-local',
            serverId: 'server-$feature',
          );
        }
        await product({
          'category': 'shared-local',
          'financeCategory': 'shared-local',
        }, update: update);
        final payload = (await queue.listPending()).single.payload!;
        expect(payload['category_id'], 'server-inventory');
        expect(payload['finance_category_id'], 'server-finance');
      },
    );
    for (final kind in paths.keys) {
      test('${update ? 'update' : 'create'} rejects pending '
          '$kind before product enqueue', () async {
        final path = paths[kind]!;
        await queue.enqueueIfOffline(
          feature: kind == 'financeCategory' ? 'finance' : 'inventory',
          method: 'POST',
          path: path,
          workspaceId: 'ws',
          entityId: 'local',
          payload: {'name': 'Local'},
        );
        await expectLater(
          product({kind: 'local'}, update: update),
          throwsA(isA<InventorySetupAwaitingSync>()),
        );
        final pending = await queue.listPending();
        expect(pending, hasLength(1));
        expect(pending.single.path, path);
        verifyNever(() => api.postJson(any(), any()));
        verifyNever(() => api.patchJson(any(), any()));
      });
    }
    test('${update ? 'update' : 'create'} queues reconciled server references '
        'after setup sync', () async {
      for (final kind in paths.keys) {
        await store.saveLocalIdMapping(
          userId: 'user',
          workspaceId: 'ws',
          feature: kind == 'financeCategory' ? 'finance' : 'inventory',
          localId: 'local-$kind',
          serverId: 'server-$kind',
        );
      }
      await product({
        for (final kind in paths.keys) kind: 'local-$kind',
      }, update: update);
      final pending = await queue.listPending();
      expect(pending, hasLength(1));
      expect(pending.single.payload!['category_id'], 'server-category');
      expect(
        ((pending.single.payload!['inventory'] as List).single
            as Map<String, dynamic>)['warehouse_id'],
        'server-warehouse',
      );
      expect(
        pending.single.payload!['finance_category_id'],
        'server-financeCategory',
      );
      expect(pending.single.payload!['owner_id'], 'server-owner');
      expect(pending.single.payload!['manufacturer_id'], 'server-manufacturer');
      expect(
        ((pending.single.payload!['inventory'] as List).single
            as Map<String, dynamic>)['unit_id'],
        'server-unit',
      );
      verifyNever(() => api.postJson(any(), any()));
      verifyNever(() => api.patchJson(any(), any()));
    });
  }
}
