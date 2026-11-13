// Startup benchmark for CacheStore.init(); skipped unless explicitly enabled:
//
//   flutter test test/core/cache/cache_store_init_benchmark_test.dart \
//     --dart-define=CACHE_INIT_BENCHMARK=true
//
// Optional: --dart-define=CACHE_INIT_BENCHMARK_SIZES=1000,5000,20000
//           --dart-define=CACHE_INIT_BENCHMARK_RUNS=7
import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mocktail/mocktail.dart';

class _MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

const _enabled = bool.fromEnvironment('CACHE_INIT_BENCHMARK');
const _sizes = String.fromEnvironment(
  'CACHE_INIT_BENCHMARK_SIZES',
  defaultValue: '1000,5000,20000',
);
const _runs = int.fromEnvironment('CACHE_INIT_BENCHMARK_RUNS', defaultValue: 7);

const _namespaces = [
  'tasks.board.list',
  'calendar.events.list',
  'finance.transactions.list',
  'crm.users.list',
  'chat.messages.list',
  'drive.files.list',
];

Map<String, dynamic> _entity(int resource, int index) => {
  'id': 'entity-$resource-$index',
  'name': 'Item $index of resource $resource',
  'description': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'created_at': '2026-01-01T00:00:00.000Z',
  'updated_at': '2026-02-01T00:00:00.000Z',
  'ws_id': 'workspace-${resource % 4}',
  'creator_id': 'user-1',
  'amount': index * 1000,
  'tags': ['alpha', 'beta'],
};

/// Seeds the encrypted boxes the way a steady-state device holds them:
/// canonical keys, a migrated replica, and a few queued mutations.
Future<void> _seed(Directory dir, List<int> key, int resources) async {
  Hive.init(dir.path);
  final cipher = HiveAesCipher(key);
  final resourceBox = await Hive.openBox<dynamic>(
    'offline_cache_v1',
    encryptionCipher: cipher,
  );
  final entityBox = await Hive.openBox<dynamic>(
    'offline_entities_v1',
    encryptionCipher: cipher,
  );
  final mutationBox = await Hive.openBox<dynamic>(
    'offline_mutations_v1',
    encryptionCipher: cipher,
  );
  final fetchedAt = DateTime.utc(2026, 11);
  var resourceBatch = <String, dynamic>{};
  var entityBatch = <String, dynamic>{};
  Future<void> flushBatches() async {
    await resourceBox.putAll(resourceBatch);
    await entityBox.putAll(entityBatch);
    resourceBatch = {};
    entityBatch = {};
  }

  for (var i = 0; i < resources; i++) {
    final namespace = _namespaces[i % _namespaces.length];
    final cacheKey = CacheKey(
      namespace: namespace,
      userId: 'user-1',
      workspaceId: 'workspace-${i % 4}',
      locale: 'en',
      params: {'page': '${i ~/ _namespaces.length}', 'filter': 'all'},
    );
    final entities = [for (var e = 0; e < 4; e++) _entity(i, e)];
    resourceBatch[cacheKey.value] = {
      'key': cacheKey.value,
      'namespace': namespace,
      'jsonPayload': jsonEncode(entities),
      'fetchedAt': fetchedAt.add(Duration(seconds: i)).toIso8601String(),
      'staleAt': fetchedAt.add(const Duration(days: 1)).toIso8601String(),
      'expireAt': fetchedAt.add(const Duration(days: 30)).toIso8601String(),
      'userId': 'user-1',
      'workspaceId': 'workspace-${i % 4}',
      'locale': 'en',
      'schemaVersion': 1,
      'etag': null,
      'tags': [namespace],
      'params': cacheKey.params,
    };
    // Every other snapshot carries indexed replica rows (list namespaces).
    if (i.isEven) {
      final rowKeys = <String>[];
      for (final entity in entities) {
        final rowKey = '@entity:${cacheKey.value}|${entity['id']}';
        rowKeys.add(rowKey);
        entityBatch[rowKey] = {
          'id': entity['id'],
          'namespace': namespace,
          'sourceKey': cacheKey.value,
          'payload': entity,
          'fetchedAt': fetchedAt.toIso8601String(),
          'userId': 'user-1',
          'workspaceId': 'workspace-${i % 4}',
        };
      }
      entityBatch['@source:${cacheKey.value}'] = rowKeys;
    }
    if (resourceBatch.length >= 500) await flushBatches();
  }
  await flushBatches();
  await entityBox.put('@schema-version', 2);
  for (var m = 0; m < 50; m++) {
    await mutationBox.put('mutation-$m', {
      'id': 'mutation-$m',
      'feature': 'tasks',
      'method': 'PATCH',
      'path': '/api/v1/workspaces/workspace-0/tasks/$m',
      'body': {'name': 'Renamed $m'},
      'userId': 'user-1',
      'workspaceId': 'workspace-0',
      'createdAt': fetchedAt.toIso8601String(),
      'status': 'queued',
      'attempts': 0,
    });
  }
  await Hive.close();
}

int _median(List<int> values) {
  final sorted = [...values]..sort();
  return sorted[sorted.length ~/ 2];
}

void main() {
  test(
    'CacheStore.init cold-start benchmark',
    () async {
      final key = List<int>.generate(32, (i) => (i * 7 + 3) % 256);
      final secureStorage = _MockFlutterSecureStorage();
      final values = {'offline-cache-hive-key-v1': base64UrlEncode(key)};
      when(
        () => secureStorage.read(key: any(named: 'key')),
      ).thenAnswer((call) async => values[call.namedArguments[#key]]);
      final rows = <String>[];
      for (final size in _sizes.split(',').map(int.parse)) {
        final dir = await Directory.systemTemp.createTemp('cache-init-bench-');
        try {
          await _seed(dir, key, size);
          final bytes = dir.listSync().whereType<File>().fold<int>(
            0,
            (sum, file) => sum + file.lengthSync(),
          );
          final timings = <int>[];
          // One discarded warm-up run, then the measured runs.
          for (var run = 0; run <= _runs; run++) {
            final store = CacheStore.forTesting(
              secureStorage: secureStorage,
              directoryResolver: () async => dir,
            );
            final stopwatch = Stopwatch()..start();
            await store.init();
            stopwatch.stop();
            if (run > 0) timings.add(stopwatch.elapsedMilliseconds);
            await store.closeForTesting();
            await Hive.close();
          }
          final sorted = [...timings]..sort();
          rows.add(
            '| $size | ${(bytes / 1048576).toStringAsFixed(1)} MB '
            '| ${_median(timings)} | ${sorted.first} | ${sorted.last} |',
          );
        } finally {
          dir.deleteSync(recursive: true);
        }
      }
      // The benchmark's output is its result table.
      // ignore: avoid_print
      print(
        [
          '| records | on disk | median ms | min ms | max ms |',
          '| --- | --- | --- | --- | --- |',
          ...rows,
        ].join('\n'),
      );
    },
    skip: _enabled ? false : 'Set --dart-define=CACHE_INIT_BENCHMARK=true',
    timeout: const Timeout(Duration(minutes: 10)),
  );
}
