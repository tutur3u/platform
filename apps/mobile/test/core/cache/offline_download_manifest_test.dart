import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_download_manifest.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mocktail/mocktail.dart';

class _SecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late String? userId;
  const namespace = 'inventory.products';

  CacheKey key(String page, {String user = 'user', String ws = 'ws'}) =>
      CacheKey(
        namespace: namespace,
        userId: user,
        workspaceId: ws,
        params: {'page': page},
      );

  Future<void> seed(CacheKey source, String id) => store.write(
    key: source,
    policy: CachePolicies.offlineCatalog,
    payload: [
      {'id': id, 'name': id},
    ],
  );

  Future<List<String>> ids({String user = 'user', String ws = 'ws'}) async =>
      (await store.queryReplica(
        namespace: namespace,
        userId: user,
        workspaceId: ws,
      )).map((row) => row.id).toList();

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('offline-manifest-');
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
    userId = 'user';
    await store.init();
  });

  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  test(
    'null snapshot is retained and unknown scope cannot claim verification',
    () async {
      final manifest = OfflineDownloadManifest(store, 'user', () => userId);
      await manifest.save(key('nullable'), null);
      await manifest.verify();
      await expectLater(
        OfflineDownloadManifest.verifyScope(
          'unknown-user',
          'unknown-workspace',
        ),
        throwsStateError,
      );
    },
  );

  test(
    'completed authoritative pages remove obsolete snapshots and rows',
    () async {
      final oldPage = key('old');
      await seed(oldPage, 'deleted-on-server');
      final manifest = OfflineDownloadManifest(store, 'user', () => userId);
      await manifest.save(key('new'), [
        {'id': 'remaining'},
      ]);
      await manifest.reconcile(workspaceId: 'ws', namespaces: {namespace});
      expect(await ids(), ['remaining']);
      expect(
        (await store.read<Object?>(
          key: oldPage,
          decode: (value) => value,
        )).hasValue,
        isFalse,
      );
      await manifest.verify();
    },
  );

  test(
    'failed download verification retains prior snapshots and rows',
    () async {
      final oldPage = key('old');
      await seed(oldPage, 'previous');
      final manifest = OfflineDownloadManifest(store, 'user', () => userId);
      final newPage = key('new');
      await manifest.save(newPage, [
        {'id': 'replacement'},
      ]);
      await store.remove(newPage);
      await expectLater(
        manifest.reconcile(workspaceId: 'ws', namespaces: {namespace}),
        throwsStateError,
      );
      expect(await ids(), ['previous']);
    },
  );

  test(
    'empty collection removes ghosts while preserving scopes and outbox',
    () async {
      await seed(key('old'), 'ghost');
      await seed(key('old', user: 'another'), 'other-user');
      await seed(key('old', ws: 'another'), 'other-workspace');
      const unrelated = CacheKey(
        namespace: 'inventory.product-options',
        userId: 'user',
        workspaceId: 'ws',
      );
      await seed(unrelated, 'partial-lookup');
      await store.savePendingMutation(
        PendingMutationRecord(
          id: 'offline-sale',
          feature: 'inventory',
          method: 'POST',
          path: '/api/v1/workspaces/ws/inventory/sales',
          createdAt: DateTime.utc(2026),
          userId: 'user',
          workspaceId: 'ws',
          payload: const {'amount': 20},
        ),
      );
      final manifest = OfflineDownloadManifest(store, 'user', () => userId);
      await manifest.save(key('new'), <Object?>[]);
      await manifest.reconcile(workspaceId: 'ws', namespaces: {namespace});
      expect(await ids(), isEmpty);
      expect(await ids(user: 'another'), ['other-user']);
      expect(await ids(ws: 'another'), ['other-workspace']);
      expect(
        (await store.read<Object?>(
          key: unrelated,
          decode: (value) => value,
        )).hasValue,
        isTrue,
      );
      expect((await store.listPendingMutations()).single.id, 'offline-sale');
    },
  );

  test('account switch before reconciliation retains previous data', () async {
    await seed(key('old'), 'previous');
    final manifest = OfflineDownloadManifest(store, 'user', () => userId);
    await manifest.save(key('new'), <Object?>[]);
    userId = 'another';
    await expectLater(
      manifest.reconcile(workspaceId: 'ws', namespaces: {namespace}),
      throwsStateError,
    );
    expect(await ids(), ['previous']);
  });
  test(
    'removal events affect retained keys only in their owner scope',
    () async {
      final manifest = OfflineDownloadManifest(store, 'user', () => userId);
      final retained = key('retained');
      await manifest.save(retained, [
        {'id': 'kept'},
      ]);
      manifest.retain('inventory', 'ws');
      Set<String> affected(CacheKey source) =>
          OfflineDownloadManifest.affectedProducts(
            userId: source.userId!,
            workspaceId: source.workspaceId!,
            key: source.value,
            namespace: source.namespace,
          );
      expect(affected(retained), {'inventory'});
      expect(affected(key('unrelated')), isEmpty);
      expect(affected(key('retained', user: 'other')), {'inventory'});
      // The App consumer rejects other actors/workspaces before this fallback.
      expect(
        OfflineDownloadManifest.affectedProducts(
          userId: 'user',
          workspaceId: 'ws',
          key: 'unknown',
          namespace: 'mail.messages',
        ),
        isEmpty,
      );
    },
  );
  test('shared exchange-rate dependency invalidates finance only', () async {
    final rates = OfflineDownloadManifest(store, 'user', () => userId);
    const source = CacheKey(
      namespace: 'finance.exchangeRates',
      userId: 'user',
      workspaceId: 'global',
    );
    await rates.save(source, {'rates': <String, dynamic>{}});
    rates.retain('finance-rates', 'rates-workspace');
    expect(
      OfflineDownloadManifest.affectedProducts(
        userId: 'user',
        workspaceId: 'rates-workspace',
        key: source.value,
        namespace: source.namespace,
      ),
      {'finance'},
    );
  });
  test(
    'untracked restored product invalidates beside a tracked product',
    () async {
      final inventory = OfflineDownloadManifest(store, 'user', () => userId);
      await inventory.save(key('only-inventory', ws: 'partial-manifests'), []);
      inventory.retain('inventory', 'partial-manifests');
      expect(
        OfflineDownloadManifest.affectedProducts(
          userId: 'user',
          workspaceId: 'partial-manifests',
          key: 'restored-finance-key',
          namespace: 'finance.wallets',
        ),
        {'finance'},
      );
      expect(
        OfflineDownloadManifest.affectedProducts(
          userId: 'user',
          workspaceId: 'partial-manifests',
          key: 'unrelated-inventory-key',
          namespace: 'inventory.products',
        ),
        isEmpty,
      );
      expect(
        OfflineDownloadManifest.affectedProducts(
          userId: 'user',
          workspaceId: 'partial-manifests',
          key: 'shared-permission-key',
          namespace: 'workspace.permissions',
        ),
        {'finance', 'inventory', 'tasks', 'calendar'},
      );
    },
  );
  test(
    'product verification requires its own manifest and dependencies',
    () async {
      final inventory = OfflineDownloadManifest(store, 'user', () => userId);
      await inventory.save(key('verified', ws: 'verify-products'), []);
      inventory.retain('inventory', 'verify-products');
      await OfflineDownloadManifest.verifyProduct(
        'user',
        'verify-products',
        'inventory',
      );
      await expectLater(
        OfflineDownloadManifest.verifyProduct(
          'user',
          'verify-products',
          'finance',
        ),
        throwsStateError,
      );
      await store.remove(key('verified', ws: 'verify-products'));
      await expectLater(
        OfflineDownloadManifest.verifyProduct(
          'user',
          'verify-products',
          'inventory',
        ),
        throwsStateError,
      );
    },
  );
}
