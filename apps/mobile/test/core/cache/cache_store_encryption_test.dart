import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mocktail/mocktail.dart';

class _MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  late Directory tempDir;
  late FlutterSecureStorage secureStorage;
  late Map<String, String> secureStorageValues;
  late CacheStore cacheStore;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp(
      'tuturuuu-cache-encryption-test-',
    );
    secureStorage = _MockFlutterSecureStorage();
    secureStorageValues = <String, String>{};

    when(() => secureStorage.read(key: any(named: 'key'))).thenAnswer(
      (invocation) async =>
          secureStorageValues[invocation.namedArguments[#key] as String],
    );
    when(
      () => secureStorage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((invocation) async {
      final key = invocation.namedArguments[#key] as String;
      final value = invocation.namedArguments[#value] as String?;
      if (value == null) {
        secureStorageValues.remove(key);
      } else {
        secureStorageValues[key] = value;
      }
    });

    cacheStore = CacheStore.forTesting(
      secureStorage: secureStorage,
      directoryResolver: () async => tempDir,
    );
  });

  tearDown(() async {
    await cacheStore.closeForTesting();
    await Hive.close();
    if (tempDir.existsSync()) {
      tempDir.deleteSync(recursive: true);
    }
  });

  const key = CacheKey(namespace: 'mail.list', userId: 'a', workspaceId: 'one');
  String decode(Object? value) => value! as String;

  test('concurrent startup and requests share one fetch', () async {
    final gate = Completer<Object?>();
    var requests = 0;
    Future<Object?> fetch() {
      requests++;
      return gate.future;
    }

    final first = cacheStore.prefetch(
      key: key,
      policy: CachePolicies.detail,
      decode: decode,
      fetch: fetch,
    );
    final second = cacheStore.prefetch(
      key: key,
      policy: CachePolicies.detail,
      decode: decode,
      fetch: fetch,
    );
    await cacheStore.init();
    await Future<void>.delayed(Duration.zero);
    expect(requests, 1);
    gate.complete('inbox');
    expect((await first).data, 'inbox');
    expect((await second).data, 'inbox');
    verify(
      () => secureStorage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).called(1);
  });

  test(
    'scope clearing blocks requests waiting for cache initialization',
    () async {
      final directory = Completer<Directory>();
      cacheStore = CacheStore.forTesting(
        secureStorage: secureStorage,
        directoryResolver: () => directory.future,
      );
      var requests = 0;
      Future<Object?> fetch() async {
        requests++;
        return 'private inbox';
      }

      final before = cacheStore.prefetch(
        key: key,
        policy: CachePolicies.detail,
        decode: decode,
        fetch: fetch,
      );
      final clearing = cacheStore.clearScope(userId: 'a');
      final during = cacheStore.prefetch(
        key: key,
        policy: CachePolicies.detail,
        decode: decode,
        fetch: fetch,
      );
      directory.complete(tempDir);
      await clearing;
      expect((await before).hasValue, isFalse);
      expect((await during).hasValue, isFalse);
      expect(requests, 0);
      expect(
        (await cacheStore.read(key: key, decode: decode)).hasValue,
        isFalse,
      );
      await cacheStore.closeForTesting();
      expect(
        (await cacheStore.read(key: key, decode: decode)).hasValue,
        isFalse,
      );
      final after = await cacheStore.prefetch(
        key: key,
        policy: CachePolicies.detail,
        decode: decode,
        fetch: fetch,
      );
      expect(after.data, 'private inbox');
      expect(requests, 1);
    },
  );

  test('failed fetch can be retried', () async {
    await expectLater(
      cacheStore.prefetch(
        key: key,
        policy: CachePolicies.detail,
        decode: decode,
        fetch: () async => throw StateError('offline'),
      ),
      throwsStateError,
    );
    final result = await cacheStore.prefetch(
      key: key,
      policy: CachePolicies.detail,
      decode: decode,
      fetch: () async => 'retry',
    );
    expect(result.data, 'retry');
  });

  test(
    'expired data waits for replacement rather than appearing fresh',
    () async {
      await cacheStore.write(
        key: key,
        policy: const CachePolicy(
          staleAfter: Duration(seconds: -2),
          expireAfter: Duration(seconds: -1),
        ),
        payload: 'old',
      );
      final result = await cacheStore.prefetch(
        key: key,
        policy: CachePolicies.detail,
        decode: decode,
        fetch: () async => 'new',
      );
      expect(result.data, 'new');
      expect(result.isFromCache, isFalse);
    },
  );

  test('invalidation never extends the lifetime of expired data', () async {
    await cacheStore.write(
      key: key,
      policy: const CachePolicy(
        staleAfter: Duration(seconds: -2),
        expireAfter: Duration(seconds: -1),
      ),
      payload: 'expired',
      tags: ['mail'],
    );
    await cacheStore.invalidateTags(['mail']);
    expect((await cacheStore.read(key: key, decode: decode)).isExpired, isTrue);
  });

  test('logout cannot be undone by a pending response', () async {
    final started = Completer<void>();
    final response = Completer<Object?>();
    final pending = cacheStore.prefetch(
      key: key,
      policy: CachePolicies.detail,
      decode: decode,
      fetch: () {
        started.complete();
        return response.future;
      },
    );
    await started.future;
    await cacheStore.clearScope(userId: 'a');
    response.complete('private inbox');
    expect((await pending).hasValue, isFalse);
    expect((await cacheStore.read(key: key, decode: decode)).hasValue, isFalse);
  });

  test(
    'mutation starts a new request and old response cannot overwrite it',
    () async {
      final started = Completer<void>();
      final response = Completer<Object?>();
      final pending = cacheStore.prefetch(
        key: key,
        policy: CachePolicies.detail,
        decode: decode,
        tags: ['mail'],
        fetch: () {
          started.complete();
          return response.future;
        },
      );
      await started.future;
      await cacheStore.invalidateTags(
        ['mail'],
        userId: 'a',
        workspaceId: 'one',
      );
      await cacheStore.prefetch(
        key: key,
        policy: CachePolicies.detail,
        decode: decode,
        tags: ['mail'],
        fetch: () async => 'updated',
      );
      response.complete('old');
      expect((await pending).hasValue, isFalse);
      expect((await cacheStore.read(key: key, decode: decode)).data, 'updated');
    },
  );

  test(
    'identical resources remain isolated by account and workspace',
    () async {
      const otherUser = CacheKey(
        namespace: 'mail.list',
        userId: 'b',
        workspaceId: 'one',
      );
      const otherWorkspace = CacheKey(
        namespace: 'mail.list',
        userId: 'a',
        workspaceId: 'two',
      );
      for (final scoped in [key, otherUser, otherWorkspace]) {
        await cacheStore.write(
          key: scoped,
          policy: CachePolicies.detail,
          payload: scoped.value,
        );
      }
      await cacheStore.clearScope(userId: 'a', workspaceId: 'one');
      expect(
        (await cacheStore.read(key: key, decode: decode)).hasValue,
        isFalse,
      );
      for (final scoped in [otherUser, otherWorkspace]) {
        expect(
          (await cacheStore.read(key: scoped, decode: decode)).data,
          scoped.value,
        );
      }
    },
  );

  test('a direct write wins over an older fetch for the same key', () async {
    final response = Completer<Object?>();
    final started = Completer<void>();
    final pending = cacheStore.prefetch(
      key: key,
      policy: CachePolicies.detail,
      decode: decode,
      fetch: () {
        started.complete();
        return response.future;
      },
    );
    await started.future;
    await cacheStore.write(
      key: key,
      policy: CachePolicies.detail,
      payload: 'new name',
    );
    response.complete('old name');
    expect((await pending).hasValue, isFalse);
    expect((await cacheStore.read(key: key, decode: decode)).data, 'new name');
  });

  test('unrelated writes and scoped invalidations preserve a fetch', () async {
    final response = Completer<Object?>();
    final started = Completer<void>();
    final pending = cacheStore.prefetch(
      key: key,
      policy: CachePolicies.detail,
      decode: decode,
      tags: ['mail'],
      fetch: () {
        started.complete();
        return response.future;
      },
    );
    await started.future;
    const other = CacheKey(
      namespace: 'assistant.soul',
      userId: 'b',
      workspaceId: 'two',
    );
    await cacheStore.write(
      key: other,
      policy: CachePolicies.detail,
      payload: 'other',
    );
    await cacheStore.remove(other);
    await cacheStore.invalidateTags(['mail'], userId: 'b');
    await cacheStore.invalidateTags(['mail'], workspaceId: 'two');
    await cacheStore.invalidateTags(['finance'], userId: 'a');
    await cacheStore.clearScope(userId: 'b');
    response.complete('fresh');
    await pending;
    expect((await cacheStore.read(key: key, decode: decode)).data, 'fresh');
  });

  test('encrypts cached resources and pending mutations at rest', () async {
    const resourceSecret = 'finance-wallet-secret-amount-123456789';
    const mutationSecret = 'pending-mutation-secret-description-987654321';

    await cacheStore.write(
      key: const CacheKey(
        namespace: 'finance.transactions',
        userId: 'user-1',
        workspaceId: 'workspace-1',
      ),
      policy: CachePolicies.detail,
      payload: const <String, Object?>{'description': resourceSecret},
    );
    await cacheStore.savePendingMutation(
      PendingMutationRecord(
        id: 'mutation-1',
        feature: 'finance',
        method: 'POST',
        path: '/api/v1/workspaces/workspace-1/finance',
        createdAt: DateTime.utc(2026),
        workspaceId: 'workspace-1',
        userId: 'user-1',
        payload: const <String, dynamic>{'description': mutationSecret},
      ),
    );

    final cached = await cacheStore.read<Map<String, dynamic>>(
      key: const CacheKey(
        namespace: 'finance.transactions',
        userId: 'user-1',
        workspaceId: 'workspace-1',
      ),
      decode: (json) => Map<String, dynamic>.from(json! as Map),
    );
    final pendingMutations = await cacheStore.listPendingMutations();

    expect(cached.data?['description'], resourceSecret);
    expect(pendingMutations.single.payload?['description'], mutationSecret);
    expect(secureStorageValues, isNotEmpty);

    await cacheStore.closeForTesting();
    await Hive.close();

    final reopenedStore = CacheStore.forTesting(
      secureStorage: secureStorage,
      directoryResolver: () async => tempDir,
    );
    addTearDown(reopenedStore.closeForTesting);

    final reopenedCached = await reopenedStore.read<Map<String, dynamic>>(
      key: const CacheKey(
        namespace: 'finance.transactions',
        userId: 'user-1',
        workspaceId: 'workspace-1',
      ),
      decode: (json) => Map<String, dynamic>.from(json! as Map),
    );
    final reopenedPendingMutations = await reopenedStore.listPendingMutations();

    expect(reopenedCached.data?['description'], resourceSecret);
    expect(
      reopenedPendingMutations.single.payload?['description'],
      mutationSecret,
    );

    await reopenedStore.closeForTesting();
    await Hive.close();

    final diskBytes = <int>[];
    await for (final entity in tempDir.list(recursive: true)) {
      if (entity is File) {
        diskBytes.addAll(await entity.readAsBytes());
      }
    }

    final diskText = utf8.decode(diskBytes, allowMalformed: true);
    expect(diskText, isNot(contains(resourceSecret)));
    expect(diskText, isNot(contains(mutationSecret)));
  });
}
