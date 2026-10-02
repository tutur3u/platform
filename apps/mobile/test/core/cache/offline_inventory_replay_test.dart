import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_inventory_mutation.dart';
import 'package:mobile/core/cache/offline_inventory_persistence.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _SecureStorage extends Mock implements FlutterSecureStorage {}

class _Api extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late OfflineMutationQueue queue;
  late StreamController<List<ConnectivityResult>> connectivity;
  late bool online;
  late String? user;
  late _Api api;
  var sequence = 0;

  PendingMutationRecord record(
    String id,
    String collection, {
    String method = 'POST',
    String? entity,
    Map<String, dynamic> payload = const {'name': 'Synthetic'},
    String workspace = 'ws-1',
    String owner = 'user-1',
  }) => PendingMutationRecord(
    id: id,
    feature: 'inventory',
    userId: owner,
    workspaceId: workspace,
    method: method,
    path: '/api/v1/workspaces/$workspace/$collection',
    payload: payload,
    optimisticPatch: {'entityId': entity ?? id},
    createdAt: DateTime.utc(
      2026,
      10,
      3,
    ).add(Duration(microseconds: sequence++)),
  );

  Future<void> makeQueue() async {
    queue = OfflineMutationQueue.forTesting(
      store: store,
      userId: () => user,
      checkConnectivity: () async => [
        if (online) ConnectivityResult.wifi else ConnectivityResult.none,
      ],
      connectivityChanges: connectivity.stream,
      apiFactory: (_) => api,
    );
    await queue.init();
    await queue.synchronize();
  }

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('inventory-replay-');
    final secrets = <String, String>{};
    final storage = _SecureStorage();
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((call) async => secrets[call.namedArguments[#key] as String]);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      secrets[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    api = _Api();
    online = false;
    user = 'user-1';
    connectivity = StreamController<List<ConnectivityResult>>.broadcast();
    await makeQueue();
  });

  tearDown(() async {
    await queue.synchronize();
    await queue.dispose();
    await connectivity.close();
    await store.closeForTesting();
    await Hive.close();
    directory.deleteSync(recursive: true);
  });

  test(
    'later prerequisite creates first and rewrites only typed fields',
    () async {
      final product = record(
        'product',
        'products',
        payload: {'name': 'category', 'category_id': 'category'},
      );
      await queue.enqueue(product);
      await queue.enqueue(record('category', 'product-categories'));
      final sends = <String>[];
      queue.registerDispatcher('inventory', (item) async {
        final mutation = OfflineInventoryMutation.fromRecord(item)!;
        final ids = await OfflineInventoryPersistence(
          store,
        ).mappings(mutation.references);
        final resolved = mutation.resolve(ids);
        sends.add(item.id);
        if (item.id == 'product') {
          expect(resolved.payload!['category_id'], 'server-category');
          expect(resolved.payload!['name'], 'category');
        }
        await queue.acknowledgeInventoryCreate(item, 'server-${item.id}');
      });
      online = true;
      await queue.drain();
      expect(sends, ['category', 'product']);
      expect(await queue.listPending(), isEmpty);
    },
  );

  test('same entity writes retain original order after creator', () async {
    await queue.enqueue(record('edit-1', 'products/local', method: 'PUT'));
    await queue.enqueue(record('edit-2', 'products/local', method: 'PUT'));
    await queue.enqueue(record('local', 'products'));
    final sends = <String>[];
    queue.registerDispatcher('inventory', (item) async {
      sends.add(item.id);
      if (item.method == 'POST') {
        await queue.acknowledgeInventoryCreate(item, 'server');
      }
    });
    online = true;
    await queue.drain();
    expect(sends, ['local', 'edit-1', 'edit-2']);
  });

  test(
    'restart publishes committed acknowledgment without sending again',
    () async {
      final create = record('local', 'products');
      await queue.enqueue(create);
      await OfflineInventoryPersistence(store).acknowledge(create, 'server');
      await queue.dispose();
      await makeQueue();
      var sends = 0;
      queue.registerDispatcher('inventory', (_) async {
        sends++;
      });
      online = true;
      await queue.drain();
      expect(sends, 0);
      expect(await queue.listPending(), isEmpty);
      final ref = OfflineInventoryMutation.fromRecord(create)!.identity!;
      expect(
        (await OfflineInventoryPersistence(store).mappings([ref]))[ref],
        'server',
      );
    },
  );

  test('lost response retries the same operation and creates once', () async {
    final received = <String, String>{};
    var calls = 0;
    when(() => api.postJson(any(), any())).thenAnswer((call) async {
      final body = call.positionalArguments[1] as Map<String, dynamic>;
      final id = body['operation_id'] as String;
      received.putIfAbsent(id, () => '11111111-1111-4111-8111-111111111111');
      if (++calls == 1) {
        throw const ApiException(message: 'Lost response', statusCode: 0);
      }
      return {
        'contract': 'inventory-offline-create-v1',
        'resource': 'category',
        'data': {'id': received[id]},
      };
    });
    await queue.enqueue(record('operation', 'product-categories'));
    online = true;
    await queue.drain();
    expect(
      (await queue.listPending()).single.status,
      PendingMutationStatus.queued,
    );
    await queue.dispose();
    online = false;
    await makeQueue();
    online = true;
    await queue.drain();
    expect(calls, 2);
    expect(received.keys, ['operation']);
    expect(await queue.listPending(), isEmpty);
  });

  test(
    'account switch after response retains owner record and fences others',
    () async {
      await queue.enqueue(record('first', 'product-categories'));
      await queue.enqueue(record('second', 'product-units'));
      final sends = <String>[];
      queue.registerDispatcher('inventory', (item) async {
        sends.add(item.id);
        user = 'user-2';
        await queue.acknowledgeInventoryCreate(item, 'server');
      });
      online = true;
      await queue.drain();
      expect(sends, ['first']);
      final retained = await store.listPendingMutations();
      expect(retained, hasLength(2));
      expect(retained.every((item) => item.userId == 'user-1'), isTrue);
      expect(retained.first.status, PendingMutationStatus.queued);
    },
  );

  test(
    'canceled prerequisite remains missing while unrelated work advances',
    () async {
      await queue.enqueue(record('category', 'product-categories'));
      expect(await queue.cancel('category'), isTrue);
      await queue.enqueue(
        record(
          'dependent',
          'products',
          payload: {'name': 'Product', 'category_id': 'category'},
        ),
      );
      await queue.enqueue(record('independent', 'product-units'));
      final sends = <String>[];
      queue.registerDispatcher('inventory', (item) async {
        sends.add(item.id);
        await queue.acknowledgeInventoryCreate(item, 'server');
      });
      online = true;
      await queue.drain();
      expect(sends, ['independent']);
      expect(
        (await queue.listPending()).single.dependencyIssue,
        OfflineDependencyIssue.missing,
      );
    },
  );

  test('malformed retained arrays do not prevent independent replay', () async {
    await queue.enqueue(
      record(
        'invalid',
        'products',
        payload: {
          'name': 'Bad',
          'inventory': [42],
        },
      ),
    );
    await queue.enqueue(record('independent', 'product-units'));
    final sends = <String>[];
    queue.registerDispatcher('inventory', (item) async {
      sends.add(item.id);
      await queue.acknowledgeInventoryCreate(item, 'server');
    });
    online = true;
    await queue.drain();
    expect(sends, ['independent']);
    final retained = (await queue.listPending()).single;
    expect(retained.status, PendingMutationStatus.failed);
    expect(retained.dependencyIssue, OfflineDependencyIssue.invalidPayload);
  });

  test(
    'delete acknowledgment recovers locally and blocks stale mapped references',
    () async {
      final create = record('local', 'product-categories');
      await queue.enqueue(create);
      await queue.acknowledgeInventoryCreate(create, 'server');
      await store.deletePendingMutation(create.id);
      final deletion = record(
        'delete',
        'product-categories/local',
        method: 'DELETE',
      );
      await queue.enqueue(deletion);
      await OfflineInventoryPersistence(
        store,
      ).acknowledgeDeletion(deletion, 'server');
      await queue.enqueue(
        record(
          'dependent',
          'products',
          payload: {'name': 'Product', 'category_id': 'local'},
        ),
      );
      await queue.dispose();
      await makeQueue();
      var sends = 0;
      queue.registerDispatcher('inventory', (_) async {
        sends++;
      });
      online = true;
      await queue.drain();
      expect(sends, 0);
      expect((await queue.listPending()).single.id, 'dependent');
      expect(
        (await queue.listPending()).single.dependencyIssue,
        OfflineDependencyIssue.missing,
      );
      final ref = OfflineInventoryMutation.fromRecord(create)!.identity!;
      expect(await OfflineInventoryPersistence(store).mappings([ref]), isEmpty);
      await expectLater(
        OfflineInventoryPersistence(store).publishAcknowledgment(
          create.copyWith(acknowledgedServerId: 'server'),
        ),
        throwsA(
          isA<ApiException>().having(
            (e) => e.code,
            'code',
            'OFFLINE_RESOURCE_DELETED',
          ),
        ),
      );
    },
  );

  test(
    'old server capability automatically retries after bounded backoff',
    () async {
      var calls = 0;
      when(() => api.postJson(any(), any())).thenAnswer((_) async {
        if (++calls == 1) {
          throw const ApiException(message: 'Old route', statusCode: 404);
        }
        return {
          'contract': 'inventory-offline-create-v1',
          'resource': 'category',
          'data': {'id': '11111111-1111-4111-8111-111111111111'},
        };
      });
      await queue.enqueue(record('operation', 'product-categories'));
      online = true;
      await queue.drain();
      expect(
        (await queue.listPending()).single.dependencyIssue,
        OfflineDependencyIssue.contractUnavailable,
      );
      await Future<void>.delayed(const Duration(milliseconds: 2200));
      await queue.synchronize();
      expect(calls, 2);
      expect(await queue.listPending(), isEmpty);
    },
  );

  test(
    'online helper persists identity before HTTP and returns actual resource',
    () async {
      online = true;
      const server = '11111111-1111-4111-8111-111111111111';
      when(() => api.postJson(any(), any())).thenAnswer((call) async {
        final body = call.positionalArguments[1] as Map<String, dynamic>;
        final pending = await store.listPendingMutations();
        expect(pending.single.entityId, body['operation_id']);
        return {
          'contract': 'inventory-offline-create-v1',
          'resource': 'period',
          'data': {
            'id': server,
            'name': 'Authoritative',
            'created_at': '2026-10-03',
          },
        };
      });
      final result = await queueOrSendValue<Map<String, dynamic>>(
        queue: queue,
        feature: 'inventory',
        method: 'POST',
        workspaceId: 'ws-1',
        path: '/api/v1/workspaces/ws-1/inventory/sales-periods',
        payload: {'name': 'Local'},
        pendingValue: (id) => {'id': id, 'name': 'Local'},
        acknowledgedValue: (data) => data,
        send: () async => throw StateError('Legacy endpoint must not run'),
      );
      expect(result, {
        'id': server,
        'name': 'Authoritative',
        'created_at': '2026-10-03',
      });
      expect(await queue.listPending(), isEmpty);
      verify(() => api.postJson(any(), any())).called(1);
    },
  );

  test(
    'offline helper returns optimistic entity without sending legacy create',
    () async {
      final result = await queueOrSendValue<Map<String, dynamic>>(
        queue: queue,
        feature: 'inventory',
        method: 'POST',
        workspaceId: 'ws-1',
        path: '/api/v1/workspaces/ws-1/inventory/sales-periods',
        payload: {'name': 'Local'},
        pendingValue: (id) => {'id': id, 'name': 'Local'},
        acknowledgedValue: (data) => data,
        send: () async => throw StateError('Legacy endpoint must not run'),
      );
      expect(result['id'], (await queue.listPending()).single.entityId);
      expect(result['name'], 'Local');
      verifyNever(() => api.postJson(any(), any()));
    },
  );

  test('observed update survives restart without repeating HTTP', () async {
    final edit = record('edit', 'products/server', method: 'PATCH');
    await queue.enqueue(edit);
    await store.updatePendingMutation(
      edit.id,
      (current) => current.copyWith(
        acknowledgedWrite: true,
        acknowledgedData: {'id': 'server', 'name': 'Actual'},
      ),
    );
    await queue.dispose();
    await makeQueue();
    var sends = 0;
    queue.registerDispatcher('inventory', (_) async {
      sends++;
    });
    online = true;
    await queue.drain();
    expect(sends, 0);
    expect(await queue.listPending(), isEmpty);
  });

  test(
    'online edit helper returns authoritative values after durable write ack',
    () async {
      online = true;
      when(() => api.patchJson(any(), any())).thenAnswer(
        (_) async => {
          'data': {'id': 'server', 'name': 'Actual'},
        },
      );
      final result = await queueOrSendValue<Map<String, dynamic>>(
        queue: queue,
        feature: 'inventory',
        method: 'PATCH',
        workspaceId: 'ws-1',
        path: '/api/v1/workspaces/ws-1/products/server',
        entityId: 'server',
        payload: {'name': 'Requested'},
        pendingValue: (id) => {'id': id},
        acknowledgedValue: (data) => data,
        send: () async => throw StateError('Legacy callback must not run'),
      );
      expect(result, {'id': 'server', 'name': 'Actual'});
      verify(() => api.patchJson(any(), any())).called(1);
      expect(await queue.listPending(), isEmpty);
    },
  );

  test('foreground403 retains the record and original typed error', () async {
    online = true;
    const denied = ApiException(
      message: 'Permission denied',
      statusCode: 403,
      code: 'INVENTORY_PERMISSION_DENIED',
      offlineContractObserved: true,
    );
    when(() => api.postJson(any(), any())).thenThrow(denied);
    await expectLater(
      queueOrSendVoid(
        queue: queue,
        feature: 'inventory',
        method: 'POST',
        workspaceId: 'ws-1',
        path: '/api/v1/workspaces/ws-1/product-categories',
        payload: {'name': 'Denied'},
        send: () async => throw StateError('No legacy fallback'),
      ),
      throwsA(same(denied)),
    );
    final saved = (await queue.listPending()).single;
    expect(saved.status, PendingMutationStatus.failed);
    expect(saved.entityId, isNotNull);
    verify(() => api.postJson(any(), any())).called(1);
  });

  test(
    'HTTP replay creates six scoped prerequisites before dependent product',
    () async {
      final paths = {
        'owner': 'inventory/owners',
        'manufacturer': 'inventory/manufacturers',
        'category': 'product-categories',
        'unit': 'product-units',
        'warehouse': 'product-warehouses',
        'finance_category': 'transactions/categories',
      };
      final sent = <String>[];
      final serverIds = <String, String>{};
      when(() => api.postJson(any(), any())).thenAnswer((call) async {
        expect(
          call.positionalArguments.first,
          '/api/v1/workspaces/ws-1/inventory/offline-mutations',
        );
        final body = call.positionalArguments[1] as Map<String, dynamic>;
        final kind = body['kind'] as String;
        sent.add(kind);
        final id =
            '11111111-1111-4111-8111-'
            '${sent.length.toString().padLeft(12, '0')}';
        serverIds[kind] = id;
        if (kind == 'product') {
          final payload = body['payload'] as Map;
          expect(payload['category_id'], serverIds['category']);
          expect(payload['owner_id'], serverIds['owner']);
          expect(payload['manufacturer_id'], serverIds['manufacturer']);
          expect(payload['finance_category_id'], serverIds['finance_category']);
          final stock = (payload['inventory'] as List).single as Map;
          expect(stock['unit_id'], serverIds['unit']);
          expect(stock['warehouse_id'], serverIds['warehouse']);
        }
        return {
          'contract': 'inventory-offline-create-v1',
          'resource': kind,
          'data': {'id': id, 'name': 'Actual'},
        };
      });
      await queue.enqueue(
        record(
          'product',
          'products',
          payload: {
            'name': 'Product',
            'category_id': 'category',
            'owner_id': 'owner',
            'manufacturer_id': 'manufacturer',
            'finance_category_id': 'finance_category',
            'inventory': [
              {'unit_id': 'unit', 'warehouse_id': 'warehouse', 'amount': 1},
            ],
          },
        ),
      );
      for (final entry in paths.entries) {
        var create = record(entry.key, entry.value);
        if (entry.key == 'finance_category') {
          create = PendingMutationRecord.fromJson({
            ...create.toJson(),
            'feature': 'finance',
          });
        }
        await queue.enqueue(create);
      }
      online = true;
      await queue.drain();
      expect(sent.last, 'product');
      expect(sent.take(6).toSet(), paths.keys.toSet());
      expect(await queue.listPending(), isEmpty);
    },
  );

  test(
    'foreground injected transport is used and remains caller owned',
    () async {
      online = true;
      final borrowed = _Api();
      when(() => borrowed.postJson(any(), any())).thenAnswer(
        (_) async => {
          'contract': 'inventory-offline-create-v1',
          'resource': 'category',
          'data': {'id': '11111111-1111-4111-8111-111111111111'},
        },
      );
      await queueOrSendVoid(
        queue: queue,
        apiClient: borrowed,
        feature: 'inventory',
        method: 'POST',
        workspaceId: 'ws-1',
        path: '/api/v1/workspaces/ws-1/product-categories',
        payload: {'name': 'Synthetic'},
        send: () async => throw StateError('No legacy'),
      );
      verify(() => borrowed.postJson(any(), any())).called(1);
      verifyNever(borrowed.dispose);
      verifyNever(() => api.postJson(any(), any()));
      expect(await queue.listPending(), isEmpty);
    },
  );

  test(
    'repository client owner fence runs before persisting a foreground write',
    () async {
      final borrowed = _Api();
      const mismatch = ApiException(
        message: 'Account changed',
        statusCode: 401,
      );
      when(() => borrowed.checkUser(any())).thenThrow(mismatch);
      await expectLater(
        queueOrSendVoid(
          queue: queue,
          apiClient: borrowed,
          feature: 'inventory',
          method: 'POST',
          workspaceId: 'ws-1',
          path: '/api/v1/workspaces/ws-1/product-categories',
          payload: {'name': 'Synthetic'},
          send: () async => throw StateError('No legacy'),
        ),
        throwsA(same(mismatch)),
      );
      expect(await queue.listPending(), isEmpty);
      verifyNever(() => borrowed.postJson(any(), any()));
      verifyNever(() => api.postJson(any(), any()));
    },
  );

  test('atomic acknowledgment cannot resurrect a canceled record', () async {
    final create = record('local', 'products');
    await queue.enqueue(create);
    await store.deletePendingMutation(create.id);
    await expectLater(
      OfflineInventoryPersistence(store).acknowledge(create, 'server'),
      throwsStateError,
    );
    expect(await store.listPendingMutations(), isEmpty);
  });
}
