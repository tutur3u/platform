import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_download_manifest.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

void main() {
  late Directory directory;
  late CacheStore store;
  late _Storage storage;
  late Map<String, String> secrets;
  FutureOr<void> Function(String)? checkpoint;
  const key = CacheKey(
    namespace: 'inventory.products',
    userId: 'a',
    workspaceId: 'one',
  );
  const other = CacheKey(
    namespace: 'inventory.products',
    userId: 'b',
    workspaceId: 'two',
  );

  CacheStore open() => CacheStore.forTesting(
    secureStorage: storage,
    directoryResolver: () async => directory,
    persistenceCheckpoint: (stage) => checkpoint?.call(stage),
  );
  Future<void> write(CacheKey target, String title) => store.write(
    key: target,
    policy: CachePolicies.moduleData,
    payload: [
      {'id': 'product', 'name': title, 'inventory': <dynamic>[]},
    ],
  );
  Future<List<String>> names() async => (await store.queryReplica(
    namespace: key.namespace,
    userId: 'a',
    workspaceId: 'one',
  )).map((row) => row.payload['name'] as String).toList();

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('cache-publication-');
    storage = _Storage();
    secrets = {};
    checkpoint = null;
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
    store = open();
  });
  tearDown(() async {
    checkpoint = null;
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  for (final stage in ['snapshot', 'replica-rows', 'replica-index']) {
    test(
      '$stage failure retains the previous response and source index',
      () async {
        await write(key, 'Previous');
        checkpoint = (at) {
          if (at == stage) throw StateError('Interrupted');
        };
        await expectLater(write(key, 'Attempt'), throwsStateError);
        checkpoint = null;
        expect(await names(), ['Previous']);
        final payload = store
            .peek<List<dynamic>>(
              key: key,
              decode: (json) => json! as List<dynamic>,
            )
            .data!;
        expect((payload.single as Map)['name'], 'Previous');
        await store.closeForTesting();
        store = open();
        expect(await names(), ['Previous']);
        final inventory = await store.offlineInventory(
          userId: 'a',
          workspaceId: 'one',
          moduleId: 'inventory',
        );
        expect(inventory.namespaces.single.items, 1);
      },
    );
  }

  test(
    'resource clear during a failed refresh never resurrects old rows',
    () async {
      await write(key, 'Previous');
      await write(other, 'Other actor');
      await store.savePendingMutation(
        PendingMutationRecord(
          id: 'queued',
          feature: 'inventory',
          method: 'PATCH',
          path: '/products/product',
          createdAt: DateTime.utc(2026),
          userId: 'a',
          workspaceId: 'one',
          payload: const {'name': 'Queued'},
        ),
      );
      Future<void>? clearing;
      checkpoint = (stage) {
        if (stage == 'replica-index') {
          clearing = store.clearScope(
            userId: 'a',
            workspaceId: 'one',
            resourceOnly: true,
          );
          throw StateError('Interrupted');
        }
      };
      await expectLater(write(key, 'Attempt'), throwsStateError);
      await clearing;
      checkpoint = null;
      expect(await names(), isEmpty);
      expect(
        store.peek<Object?>(key: key, decode: (json) => json).hasValue,
        isFalse,
      );
      expect((await store.listPendingMutations()).single.id, 'queued');
      expect(
        (await store.queryReplica(
          namespace: other.namespace,
          userId: 'b',
          workspaceId: 'two',
        )).single.payload['name'],
        'Other actor',
      );
      await store.closeForTesting();
      store = open();
      expect(await names(), isEmpty);
    },
  );

  test(
    'actor switch while publishing fails closed without restoring snapshot',
    () async {
      await write(key, 'Previous');
      var actor = 'a';
      checkpoint = (stage) {
        if (stage == 'replica-rows') actor = 'b';
      };
      await expectLater(
        store.write(
          key: key,
          policy: CachePolicies.moduleData,
          payload: [
            {'id': 'product', 'name': 'Attempt'},
          ],
          checkScope: () {
            if (actor != 'a') throw StateError('Actor changed');
          },
        ),
        throwsStateError,
      );
      checkpoint = null;
      expect(await names(), isEmpty);
      expect(
        store.peek<Object?>(key: key, decode: (json) => json).hasValue,
        isFalse,
      );
    },
  );

  test(
    'new same-source publication survives failure of its queued predecessor',
    () async {
      await write(key, 'Previous');
      final reached = Completer<void>();
      final release = Completer<void>();
      checkpoint = (stage) async {
        if (stage == 'replica-rows') {
          reached.complete();
          await release.future;
          throw StateError('Interrupted');
        }
      };
      final failed = expectLater(write(key, 'Attempt'), throwsStateError);
      await reached.future;
      final newer = write(key, 'Newer');
      checkpoint = null;
      release.complete();
      await failed;
      await newer;
      expect(await names(), ['Newer']);
    },
  );

  test(
    'reconciliation waits for publication and retains the completed source',
    () async {
      final reached = Completer<void>();
      final release = Completer<void>();
      checkpoint = (stage) async {
        if (stage == 'replica-rows') {
          reached.complete();
          await release.future;
        }
      };
      final publication = write(key, 'Downloaded');
      await reached.future;
      final reconciliation = store.reconcileCompletedNamespaces(
        userId: 'a',
        workspaceId: 'one',
        namespaces: {key.namespace},
        retainedKeys: {key.value},
        checkScope: () {},
      );
      release.complete();
      await publication;
      await reconciliation;
      expect(await names(), ['Downloaded']);
    },
  );
  for (final stage in ['snapshot', 'replica-rows', 'replica-index']) {
    test(
      '$stage interrupted process recovers prior snapshot on reopening',
      () async {
        await write(key, 'Previous');
        checkpoint = (at) {
          if (at == stage) throw const CachePersistenceInterruption();
        };
        await expectLater(
          write(key, 'Attempt'),
          throwsA(isA<CachePersistenceInterruption>()),
        );
        checkpoint = null;
        await store.closeForTesting();
        store = open();
        expect(await names(), ['Previous']);
        expect(
          Hive.box<dynamic>('offline_entities_v1').values
              .whereType<Map<dynamic, dynamic>>()
              .where((raw) => raw['kind'] == 'resource-publication'),
          isEmpty,
        );
      },
    );
  }
  test(
    'interrupted reconciliation completes obsolete deletion after reopening',
    () async {
      await write(key, 'Previous');
      const second = CacheKey(
        namespace: 'inventory.products',
        userId: 'a',
        workspaceId: 'one',
        params: {'page': '2'},
      );
      await store.write(
        key: second,
        policy: CachePolicies.moduleData,
        payload: [
          {'id': 'second', 'name': 'Second'},
        ],
      );
      checkpoint = (stage) {
        if (stage == 'reconciliation') {
          throw const CachePersistenceInterruption();
        }
      };
      await expectLater(
        store.reconcileCompletedNamespaces(
          userId: 'a',
          workspaceId: 'one',
          namespaces: {key.namespace},
          retainedKeys: {},
          checkScope: () {},
        ),
        throwsA(isA<CachePersistenceInterruption>()),
      );
      checkpoint = null;
      await store.closeForTesting();
      store = open();
      expect(await names(), isEmpty);
      expect(
        store.peek<Object?>(key: second, decode: (json) => json).hasValue,
        isFalse,
      );
    },
  );
  test(
    'durable clear intent wins over interrupted publication after restart',
    () async {
      await write(key, 'Previous');
      await write(other, 'Other actor');
      await store.savePendingMutation(
        PendingMutationRecord(
          id: 'keep',
          feature: 'inventory',
          method: 'PATCH',
          path: '/products/product',
          createdAt: DateTime.utc(2026),
          userId: 'a',
          workspaceId: 'one',
        ),
      );
      checkpoint = (stage) {
        if (stage == 'replica-rows') throw const CachePersistenceInterruption();
      };
      await expectLater(
        write(key, 'Attempt'),
        throwsA(isA<CachePersistenceInterruption>()),
      );
      checkpoint = (stage) {
        if (stage == 'clear-intent') throw const CachePersistenceInterruption();
      };
      await expectLater(
        store.clearScope(userId: 'a', workspaceId: 'one', resourceOnly: true),
        throwsA(isA<CachePersistenceInterruption>()),
      );
      checkpoint = null;
      await store.closeForTesting();
      store = open();
      expect(await names(), isEmpty);
      expect((await store.listPendingMutations()).single.id, 'keep');
      expect(
        (await store.queryReplica(
          namespace: other.namespace,
          userId: 'b',
          workspaceId: 'two',
        )).single.payload['name'],
        'Other actor',
      );
    },
  );
  test('completed clear consumes journals and preserves ID mappings', () async {
    await write(key, 'Previous');
    await store.saveLocalIdMapping(
      userId: 'a',
      workspaceId: 'one',
      feature: 'inventory:category',
      localId: 'local',
      serverId: 'server',
    );
    checkpoint = (stage) {
      if (stage == 'replica-index') {
        throw const CachePersistenceInterruption();
      }
    };
    await expectLater(
      write(key, 'Attempt'),
      throwsA(isA<CachePersistenceInterruption>()),
    );
    checkpoint = null;
    await store.clearScope(userId: 'a', workspaceId: 'one', resourceOnly: true);
    await store.closeForTesting();
    store = open();
    expect(await names(), isEmpty);
    expect(
      await store.localIdMappings(
        userId: 'a',
        workspaceId: 'one',
        feature: 'inventory:category',
      ),
      {'local': 'server'},
    );
  });

  test('failed reconciliation completes obsolete deletion', () async {
    await write(key, 'Previous');
    checkpoint = (stage) {
      if (stage == 'reconciliation') {
        final cached = store.peek<List<dynamic>>(
          key: key,
          decode: (json) => json! as List<dynamic>,
        );
        expect(cached.hasValue, isFalse);
        final journal = Hive.box<dynamic>('offline_entities_v1').values
            .whereType<Map<dynamic, dynamic>>()
            .singleWhere((row) => row['kind'] == 'resource-deletion');
        expect(jsonEncode(journal), isNot(contains('Previous')));
        expect(
          (journal['entries'] as List).single,
          isNot(contains('previousResource')),
        );
        throw StateError('Cleanup failed');
      }
    };
    await expectLater(
      store.reconcileCompletedNamespaces(
        userId: 'a',
        workspaceId: 'one',
        namespaces: {key.namespace},
        retainedKeys: {},
        checkScope: () {},
      ),
      throwsStateError,
    );
    checkpoint = null;
    expect(await names(), isEmpty);
  });
  test(
    'interrupted eviction never copies or restores private evicted data',
    () async {
      await write(key, 'Previous');
      checkpoint = (stage) {
        if (stage == 'pruning') {
          expect(
            store.peek<Object?>(key: key, decode: (json) => json).hasValue,
            isFalse,
          );
          final journal = Hive.box<dynamic>('offline_entities_v1').values
              .whereType<Map<dynamic, dynamic>>()
              .singleWhere((row) => row['kind'] == 'resource-deletion');
          final entry = (journal['entries'] as List).single as Map;
          expect(
            entry.keys,
            unorderedEquals([
              'sourceKey',
              'userId',
              'workspaceId',
              'namespace',
            ]),
          );
          expect(jsonEncode(journal), isNot(contains('Previous')));
          throw const CachePersistenceInterruption();
        }
      };
      await expectLater(
        store.pruneForTesting(1),
        throwsA(isA<CachePersistenceInterruption>()),
      );
      checkpoint = null;
      await store.closeForTesting();
      store = open();
      expect(await names(), isEmpty);
    },
  );
  test('own completed download reconciliation still finishes ready', () async {
    await write(key, 'Obsolete');
    final coordinator = OfflinePreparationCoordinator.forTesting(
      load: (_, _) async => {},
      write: (_, _, _) async {},
    );
    final manifest = OfflineDownloadManifest(store, 'a', () => 'a');
    void removed() {
      final event = store.removedResource.value!;
      coordinator.invalidateRetainedData(
        productIds: OfflineDownloadManifest.affectedProducts(
          userId: 'a',
          workspaceId: 'one',
          key: event.key,
          namespace: event.namespace,
        ),
      );
    }

    store.removedResource.addListener(removed);
    coordinator
      ..register('inventory', (_) async {
        const fresh = CacheKey(
          namespace: 'inventory.products',
          userId: 'a',
          workspaceId: 'one',
          params: {'page': 'new'},
        );
        await manifest.save(fresh, [
          {'id': 'fresh', 'name': 'Fresh'},
        ]);
        await manifest.reconcile(
          workspaceId: 'one',
          namespaces: {key.namespace},
        );
        manifest.retain('inventory', 'one');
      })
      ..verifyProductRetention = (_, _, _) => manifest.verify();
    try {
      await coordinator.run(
        userId: 'a',
        workspaceId: 'one',
        productId: 'inventory',
      );
      expect(
        coordinator.state.value.products['inventory']!.status,
        OfflinePreparationStatus.ready,
      );
      expect(await names(), ['Fresh']);
    } finally {
      store.removedResource.removeListener(removed);
    }
  });
}
