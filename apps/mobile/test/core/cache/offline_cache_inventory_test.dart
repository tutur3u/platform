import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mocktail/mocktail.dart';

class _SecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  late Directory directory;
  late _SecureStorage secureStorage;
  late Map<String, String> secrets;
  late CacheStore store;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('mobile-replica-test-');
    secureStorage = _SecureStorage();
    secrets = {};
    when(
      () => secureStorage.read(key: any(named: 'key')),
    ).thenAnswer((call) async => secrets[call.namedArguments[#key] as String]);
    when(
      () => secureStorage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      secrets[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    store = CacheStore.forTesting(
      secureStorage: secureStorage,
      directoryResolver: () async => directory,
    );
  });

  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    if (directory.existsSync()) directory.deleteSync(recursive: true);
  });

  Future<void> seed(
    String user,
    String workspace,
    String page,
    List<String> ids, {
    String namespace = 'inventory.products',
    bool expired = false,
  }) => store.write(
    key: CacheKey(
      namespace: namespace,
      userId: user,
      workspaceId: workspace,
      params: {'page': page},
    ),
    policy: expired
        ? const CachePolicy(
            staleAfter: Duration(seconds: -2),
            expireAfter: Duration(seconds: -1),
          )
        : CachePolicies.moduleData,
    payload: [
      for (final id in ids) {'id': id, 'name': 'Synthetic item'},
    ],
  );

  test('ordinary persisted fetches deduplicate overlapping pages '
      'and retain expired rows', () async {
    await seed('actor', 'workspace', '1', ['one', 'two']);
    await seed('actor', 'workspace', '2', ['two', 'three'], expired: true);
    await seed('other', 'workspace', '1', ['private']);
    await seed('actor', 'other-workspace', '1', ['private']);
    await seed('actor', 'workspace', '1', [
      'hidden',
    ], namespace: 'inventory.secrets');
    await seed('actor', 'workspace', '1', [
      'hidden',
    ], namespace: 'inventory.tokens');
    final result = await store.offlineInventory(
      userId: 'actor',
      workspaceId: 'workspace',
      moduleId: 'inventory',
    );
    expect(result.namespaces, hasLength(1));
    final products = result.namespaces.single;
    expect(products.items, 3);
    expect(products.snapshots, 2);
    expect(products.expiredSnapshots, 1);
    expect(products.logicalBytes, greaterThan(0));
    expect(result.pending, 0);
    expect(products.lastFetch, isNotNull);
    final scoped = await store.storageSnapshot(
      userId: 'actor',
      workspaceId: 'other-workspace',
    );
    expect(
      scoped.totalBytes,
      lessThan((await store.storageSnapshot()).totalBytes),
    );
  });

  test(
    'counts survive reopening encrypted persistence without download metadata',
    () async {
      await seed('actor', 'workspace', '1', ['one', 'two']);
      final before = await store.offlineInventory(
        userId: 'actor',
        workspaceId: 'workspace',
        moduleId: 'inventory',
      );
      await store.closeForTesting();
      store = CacheStore.forTesting(
        secureStorage: secureStorage,
        directoryResolver: () async => directory,
      );
      final after = await store.offlineInventory(
        userId: 'actor',
        workspaceId: 'workspace',
        moduleId: 'inventory',
      );
      expect(after.namespaces.single.items, 2);
      expect(after.logicalBytes, before.logicalBytes);
    },
  );

  test('module eviction preserves every queued write '
      'and unrelated scoped snapshot', () async {
    await seed('actor', 'workspace', '1', ['one']);
    await seed('other', 'workspace', '1', ['two']);
    await seed('actor', 'workspace', '1', [
      'three',
    ], namespace: 'finance.wallets');
    for (final user in ['actor', 'other']) {
      await store.savePendingMutation(
        PendingMutationRecord(
          id: 'pending-$user',
          userId: user,
          workspaceId: 'workspace',
          feature: 'inventory',
          method: 'PATCH',
          path: '/synthetic',
          payload: {'name': 'Synthetic edit'},
          createdAt: DateTime.utc(2030),
        ),
      );
    }
    expect(
      (await store.offlineInventory(
        userId: 'actor',
        workspaceId: 'workspace',
        moduleId: 'inventory',
      )).pending,
      1,
    );
    await store.clearNamespacePrefix(
      prefix: 'inventory.',
      userId: 'actor',
      workspaceId: 'workspace',
    );
    expect(
      (await store.offlineInventory(
        userId: 'actor',
        workspaceId: 'workspace',
        moduleId: 'inventory',
      )).namespaces,
      isEmpty,
    );
    expect(await store.listPendingMutations(), hasLength(2));
    expect(
      (await store.offlineInventory(
        userId: 'other',
        workspaceId: 'workspace',
        moduleId: 'inventory',
      )).namespaces.single.items,
      1,
    );
    expect(
      (await store.offlineInventory(
        userId: 'actor',
        workspaceId: 'workspace',
        moduleId: 'finance',
      )).namespaces.single.items,
      1,
    );
  });

  test(
    'only consistent totals for the same collection query are displayed',
    () async {
      Future<void> page(String id, int total, {String? filter}) => store.write(
        key: CacheKey(
          namespace: 'inventory.products',
          userId: 'actor',
          workspaceId: 'workspace',
          params: {'page': id, if (filter != null) 'search': filter},
        ),
        policy: CachePolicies.moduleData,
        payload: {
          'data': [
            {'id': id},
          ],
          'totalCount': total,
        },
      );
      Future<int?> total() async => (await store.offlineInventory(
        userId: 'actor',
        workspaceId: 'workspace',
        moduleId: 'inventory',
      )).namespaces.single.serverReportedTotal;
      await page('1', 7);
      await page('2', 7);
      expect(await total(), 7);
      await page('3', 8);
      expect(await total(), isNull);
      await store.clearNamespacePrefix(
        prefix: 'inventory.',
        userId: 'actor',
        workspaceId: 'workspace',
      );
      await page('1', 7);
      await page('2', 7, filter: 'synthetic-query');
      expect(await total(), isNull);
    },
  );

  test('unknown modules cannot inspect private namespaces', () async {
    await expectLater(
      store.offlineInventory(
        userId: 'actor',
        workspaceId: 'workspace',
        moduleId: 'settings',
      ),
      throwsArgumentError,
    );
  });
}
