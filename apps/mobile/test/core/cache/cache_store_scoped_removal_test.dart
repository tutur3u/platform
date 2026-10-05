import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

void main() {
  late Directory directory;
  late CacheStore store;
  late _Storage storage;
  final secrets = <String, String>{};
  FutureOr<void> Function(String)? checkpoint;
  const key = CacheKey(
    namespace: 'inventory.products',
    userId: 'actor',
    workspaceId: 'workspace',
  );
  const other = CacheKey(
    namespace: 'inventory.products',
    userId: 'other',
    workspaceId: 'other',
  );
  CacheStore open({Future<Directory> Function()? resolve}) =>
      CacheStore.forTesting(
        secureStorage: storage,
        directoryResolver: resolve ?? () async => directory,
        persistenceCheckpoint: (stage) => checkpoint?.call(stage),
      );
  Future<void> publish(CacheKey target, String name) => store.write(
    key: target,
    policy: CachePolicies.moduleData,
    payload: [
      {'id': 'product', 'name': name},
    ],
  );
  Future<List<String>> names() async => (await store.queryReplica(
    namespace: key.namespace,
    userId: key.userId!,
    workspaceId: key.workspaceId,
  )).map((row) => row.payload['name'] as String).toList();
  Future<void> reopen() async {
    await store.closeForTesting();
    store = open();
    await store.init();
  }

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('cache-scoped-remove-');
    checkpoint = null;
    secrets.clear();
    storage = _Storage();
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

  test(
    'scope change during init rejects obsolete deletion before admission',
    () async {
      await publish(key, 'Retained');
      await store.closeForTesting();
      final directoryGate = Completer<Directory>();
      store = open(resolve: () => directoryGate.future);
      var generation = 0;
      final removal = expectLater(
        store.remove(
          key,
          checkScope: () {
            if (generation != 0) throw StateError('Scope changed');
          },
        ),
        throwsStateError,
      );
      generation++;
      final current = publish(key, 'Current');
      directoryGate.complete(directory);
      await removal;
      await current;
      expect(store.resourceRemovalRevision.value, 0);
      expect(await names(), ['Current']);
      await reopen();
      expect(await names(), ['Current']);
    },
  );

  test(
    'queued deletion checks ownership after serialized admission wait',
    () async {
      await publish(key, 'Retained');
      final reached = Completer<void>();
      final release = Completer<void>();
      checkpoint = (stage) async {
        if (stage == 'snapshot') {
          reached.complete();
          await release.future;
        }
      };
      final blocker = publish(other, 'Unrelated');
      await reached.future;
      var generation = 0;
      final removal = expectLater(
        store.remove(
          key,
          checkScope: () {
            if (generation != 0) throw StateError('Scope changed');
          },
        ),
        throwsStateError,
      );
      await Future<void>.delayed(Duration.zero);
      generation++;
      final current = publish(key, 'Current');
      checkpoint = null;
      release.complete();
      await blocker;
      await removal;
      await current;
      expect(store.resourceRemovalRevision.value, 0);
      expect(await names(), ['Current']);
      await reopen();
      expect(await names(), ['Current']);
    },
  );

  test(
    'admitted denial finishes durable snapshot and replica erasure',
    () async {
      await publish(key, 'Denied history');
      await store.remove(key, checkScope: () {});
      expect(await names(), isEmpty);
      expect(
        store.peek<Object?>(key: key, decode: (value) => value).hasValue,
        false,
      );
      await reopen();
      expect(await names(), isEmpty);
      expect(
        store.peek<Object?>(key: key, decode: (value) => value).hasValue,
        false,
      );
    },
  );

  test(
    'scope change inside erase cannot strand denied replica history',
    () async {
      await publish(key, 'Denied history');
      final reached = Completer<void>();
      final release = Completer<void>();
      var generation = 0;
      checkpoint = (stage) async {
        if (stage == 'remove-snapshot') {
          reached.complete();
          await release.future;
        }
      };
      final removal = store.remove(
        key,
        checkScope: () {
          if (generation != 0) throw StateError('Scope changed');
        },
      );
      await reached.future;
      generation++;
      final current = publish(key, 'New authorization');
      checkpoint = null;
      release.complete();
      await removal;
      await current;
      expect(await names(), ['New authorization']);
      await reopen();
      expect(await names(), ['New authorization']);
    },
  );
}
