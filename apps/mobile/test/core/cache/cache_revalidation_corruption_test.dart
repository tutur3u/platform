import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_resource_removal.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  const key = CacheKey(
    namespace: 'inventory.products',
    userId: 'owner',
    workspaceId: 'team',
  );
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('corrupt-revalidation-');
    final storage = _Storage();
    final secrets = <String, String>{};
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
    await store.init();
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });
  test(
    'removal notifier retains scoped identity without private payload',
    () async {
      await store.write(
        key: key,
        policy: CachePolicies.moduleData,
        payload: {'private': 'sensitive fixture'},
      );
      await store.remove(key);
      final removal = store.removedResource.value;
      expect(removal, isNotNull);
      expect(removal, isNot(isA<CachedResourceRecord>()));
      expect(removal!.key, CacheResourceRemoval.identityForKey(key.value));
      expect(removal.namespace, key.namespace);
      expect(removal.userId, key.userId);
      expect(removal.workspaceId, key.workspaceId);
    },
  );
  test('logout removal retains no short private query text', () async {
    const privateKey = CacheKey(
      namespace: 'inventory.products',
      userId: 'owner',
      workspaceId: 'team',
      params: {'query': 'private-search-fixture'},
    );
    // Exercise the short, unhashed storage-key path without changing it.
    expect(privateKey.value, contains('private-search-fixture'));
    await store.write(
      key: privateKey,
      policy: CachePolicies.moduleData,
      payload: {'private': 'private-response-fixture'},
    );
    expect(
      (await store.read<Object?>(
        key: privateKey,
        decode: (value) => value,
      )).hasValue,
      isTrue,
    );
    await store.clearScope(userId: 'owner', resourceOnly: true);
    final removal = store.removedResource.value!;
    expect(removal.key, CacheResourceRemoval.identityForKey(privateKey.value));
    expect(removal.key, matches(RegExp(r'^sha256:[a-f0-9]{64}$')));
    expect(removal.key, isNot(contains('private-search-fixture')));
    expect(removal.key, isNot(contains('query:')));
    expect(removal.namespace, privateKey.namespace);
    expect(removal.userId, privateKey.userId);
    expect(removal.workspaceId, privateKey.workspaceId);
  });
  test(
    'corrupt domain snapshot still revalidates and stores network data',
    () async {
      await store.write(
        key: key,
        policy: CachePolicies.moduleData,
        payload: {'invalid': true},
      );
      final errors = <FlutterErrorDetails>[];
      final previous = FlutterError.onError;
      FlutterError.onError = errors.add;
      var calls = 0;
      try {
        final fresh = await store.prefetch<List<dynamic>>(
          key: key,
          policy: CachePolicies.moduleData,
          decode: (json) => json! as List<dynamic>,
          fetch: () async {
            calls++;
            return ['fresh'];
          },
        );
        expect(calls, 1);
        expect(fresh.hasValue, isTrue);
        expect(fresh.data, ['fresh']);
        expect(
          (await store.read<List<dynamic>>(
            key: key,
            decode: (json) => json! as List<dynamic>,
          )).data,
          ['fresh'],
        );
        expect(errors, hasLength(1));
      } finally {
        FlutterError.onError = previous;
      }
    },
  );
  test(
    'scope clear during corrupt revalidation still fences fresh response',
    () async {
      await store.write(
        key: key,
        policy: CachePolicies.moduleData,
        payload: {'invalid': true},
      );
      final previous = FlutterError.onError;
      FlutterError.onError = (_) {};
      final started = Completer<void>();
      final response = Completer<Object?>();
      try {
        final request = store.prefetch<List<dynamic>>(
          key: key,
          policy: CachePolicies.moduleData,
          decode: (json) => json! as List<dynamic>,
          fetch: () {
            started.complete();
            return response.future;
          },
        );
        await started.future.timeout(const Duration(seconds: 2));
        await store.clearScope(
          userId: 'owner',
          workspaceId: 'team',
          resourceOnly: true,
        );
        response.complete(['stale actor response']);
        expect((await request).hasValue, isFalse);
        expect(
          store
              .peek<List<dynamic>>(
                key: key,
                decode: (json) => json! as List<dynamic>,
              )
              .hasValue,
          isFalse,
        );
      } finally {
        FlutterError.onError = previous;
      }
    },
  );
}
