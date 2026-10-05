import 'dart:convert';
import 'dart:io';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_replica_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/local_replica_query.dart';
import 'package:mobile/core/cache/replica_entity_record.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

void main() {
  late Directory directory;
  late CacheStore store;
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('replica-policy-');
    final storage = _Storage();
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((_) async => null);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((_) async {});
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });
  Future<void> write(
    String namespace,
    Map<String, dynamic> payload, {
    String path = '',
  }) => store.write(
    key: CacheKey(
      namespace: namespace,
      userId: 'a',
      workspaceId: 'ws',
      params: {'path': path},
    ),
    policy: CachePolicies.moduleData,
    payload: payload,
  );
  Future<List<Map<String, dynamic>>> rows(List<String> namespaces) =>
      queryLocalRows(
        store: store,
        userId: 'a',
        workspaceId: 'ws',
        namespaces: namespaces,
      );
  test(
    'sparse product options preserve canonical stock and explicit null',
    () async {
      await write('inventory.product', {
        'id': 'p',
        'name': 'Canonical',
        'description': null,
        'inventory': [
          {'amount': 4},
        ],
      });
      await write('inventory.product-options', {
        'data': [
          {
            'id': 'p',
            'name': 'Sparse',
            'description': 'Old',
            'avatar_url': 'image',
          },
        ],
      });
      final result = (await rows([
        'inventory.product',
        'inventory.product-options',
      ])).single;
      expect(result['name'], 'Canonical');
      expect(result['description'], isNull);
      expect(result['inventory'], [
        {'amount': 4},
      ]);
      expect(result['avatar_url'], 'image');
      await store.clearScope(
        userId: 'a',
        workspaceId: 'ws',
        namespace: 'inventory.product',
        resourceOnly: true,
      );
      final sparse = (await rows([
        'inventory.product',
        'inventory.product-options',
      ])).single;
      expect(sparse['name'], 'Sparse');
      expect(sparse.containsKey('inventory'), isFalse);
    },
  );
  test(
    'canonical task fields survive sparse rows within and across namespaces',
    () async {
      await write('tasks.boardTasks', {
        'tasks': [
          {
            'id': 't',
            'name': 'Complete',
            'description': 'Details',
            'list_id': 'l',
          },
        ],
      }, path: 'full');
      await write('tasks.boardTasks', {
        'tasks': [
          {'id': 't', 'name': 'Sparse'},
        ],
      }, path: 'sparse');
      expect((await rows(['tasks.boardTasks'])).single['name'], 'Complete');
      await write('tasks.detail', {
        'task': {
          'id': 't',
          'name': 'Detail',
          'description': null,
          'list_id': 'l',
        },
      });
      final result = (await rows(['tasks.detail', 'tasks.boardTasks'])).single;
      expect(result['name'], 'Detail');
      expect(result['description'], isNull);
    },
  );
  test(
    'known envelopes index entities without arbitrary nested metadata',
    () async {
      await write('inventory.products', {
        'data': [
          {
            'id': 'p',
            'name': 'Product',
            'category': {'id': 'nested'},
          },
        ],
        'metadata': {
          'data': [
            {'id': 'metadata'},
          ],
        },
        'unrelated': [
          {'id': 'unrelated'},
        ],
      });
      expect((await rows(['inventory.products'])).map((row) => row['id']), [
        'p',
      ]);
    },
  );
  test(
    'newer explicit null clears older canonical fields across ranks',
    () async {
      await write('inventory.product', {
        'id': 'p',
        'description': 'Previous',
        'inventory': [
          {'amount': 4},
        ],
      });
      await write('inventory.product-options', {
        'data': [
          {'id': 'p', 'description': null},
        ],
      });
      for (final namespaces in [
        ['inventory.product', 'inventory.product-options'],
        ['inventory.product-options', 'inventory.product'],
      ]) {
        final result = (await rows(namespaces)).single;
        expect(result['description'], isNull);
        expect(result['inventory'], [
          {'amount': 4},
        ]);
      }
    },
  );
  test('newer finance redaction blocks old detail in every merge order', () {
    ReplicaEntityRecord source(
      String namespace,
      int day,
      String? description,
    ) => ReplicaEntityRecord(
      id: 'transaction',
      namespace: namespace,
      sourceKey: namespace,
      fetchedAt: DateTime.utc(2026, 1, day),
      userId: 'a',
      workspaceId: 'ws',
      payload: {
        'id': 'transaction',
        'wallet_id': 'wallet',
        'amount': 10,
        'description': description,
      },
    );
    final private = source('finance.transactionDetail', 1, 'Private old note');
    final redacted = source('finance.transactions', 2, '[CONFIDENTIAL]');
    for (final pair in [
      [private, redacted],
      [redacted, private],
    ]) {
      final result = pair.reduce(mergeReplicaRows);
      expect(result.payload['description'], '[CONFIDENTIAL]');
      expect(jsonEncode(result.toJson()), isNot(contains('Private old note')));
    }
    final authorized = source(
      'finance.transactionDetail',
      3,
      'Authorized new note',
    );
    final restored = mergeReplicaRows(
      mergeReplicaRows(private, redacted),
      authorized,
    );
    expect(restored.payload['description'], 'Authorized new note');
    final clear = source('finance.transactions', 4, null);
    expect(mergeReplicaRows(restored, clear).payload['description'], isNull);
  });

  test('newer authorized list restores stale confidential detail fields', () {
    ReplicaEntityRecord row(
      String namespace,
      int day,
      Map<String, dynamic> fields,
    ) => ReplicaEntityRecord(
      id: 'transaction',
      namespace: namespace,
      sourceKey: namespace,
      fetchedAt: DateTime.utc(2026, 1, day),
      userId: 'a',
      workspaceId: 'ws',
      payload: {'id': 'transaction', 'wallet_id': 'wallet', ...fields},
    );
    final denied = row('finance.transactionDetail', 1, {
      'description': '[CONFIDENTIAL]',
      'amount': null,
      'category_id': null,
      'is_amount_confidential': true,
      'is_category_confidential': true,
      'detail_only': 'retained',
    });
    final authorized = row('finance.transactions', 2, {
      'description': 'Authorized note',
      'amount': 25,
      'category_id': 'category',
      'is_amount_confidential': true,
      'is_category_confidential': true,
    });
    for (final pair in [
      [denied, authorized],
      [authorized, denied],
    ]) {
      final result = pair.reduce(mergeReplicaRows);
      expect(result.payload['description'], 'Authorized note');
      expect(result.payload['amount'], 25);
      expect(result.payload['category_id'], 'category');
      expect(result.payload['detail_only'], 'retained');
      final revoked = row('finance.infiniteTransactions', 3, {
        'description': '[CONFIDENTIAL]',
        'amount': null,
        'category_id': null,
        'is_amount_confidential': true,
        'is_category_confidential': true,
      });
      final hidden = mergeReplicaRows(result, revoked);
      expect(hidden.payload['description'], '[CONFIDENTIAL]');
      expect(hidden.payload['amount'], isNull);
      expect(hidden.payload['category_id'], isNull);
    }
    final ordinaryClear = row('finance.transactionDetail', 1, {
      'amount': null,
      'category_id': null,
      'is_amount_confidential': false,
      'is_category_confidential': false,
    });
    final ordinary = mergeReplicaRows(ordinaryClear, authorized);
    expect(ordinary.payload['amount'], isNull);
    expect(ordinary.payload['category_id'], isNull);
  });

  for (final clear in [false, true]) {
    test(
      'three-source fold retains canonical field and later clear=$clear',
      () {
        ReplicaEntityRecord source(
          String key,
          int time,
          String namespace,
          Map<String, dynamic> payload,
        ) => ReplicaEntityRecord(
          id: 'p',
          sourceKey: key,
          fetchedAt: DateTime.utc(2026, 1, time),
          namespace: namespace,
          userId: 'a',
          workspaceId: 'ws',
          payload: payload,
        );
        final old = source('old', 1, 'inventory.product', {
          'id': 'p',
          'description': 'Old',
          'inventory': [
            {'amount': 4},
          ],
        });
        final canonical = source('new', 2, 'inventory.product', {
          'id': 'p',
          'description': 'New',
          'inventory': [
            {'amount': 5},
          ],
        });
        final sparse = source('sparse', 3, 'inventory.product-options', {
          'id': 'p',
          'avatar_url': 'image',
          if (clear) 'description': null,
        });
        for (final permutation in [
          [old, sparse, canonical],
          [old, canonical, sparse],
          [canonical, old, sparse],
          [canonical, sparse, old],
          [sparse, old, canonical],
          [sparse, canonical, old],
        ]) {
          final result = permutation.reduce(mergeReplicaRows);
          expect(result.payload['description'], clear ? null : 'New');
          expect(result.payload['inventory'], [
            {'amount': 5},
          ]);
          expect(result.payload['avatar_url'], 'image');
          expect(result.toJson().containsKey('mergeSources'), isFalse);
        }
      },
    );
  }
}
