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

  test('long mail query keys persist, reopen, and invalidate', () async {
    const user = '11111111-1111-4111-8111-111111111111';
    const workspace = '22222222-2222-4222-8222-222222222222';
    final path = Uri.encodeComponent(
      '/api/v1/workspaces/$workspace/mail/mailboxes/'
      '33333333-3333-4333-8333-333333333333/threads'
      '?folder=inbox&query=${List.filled(60, 'thư').join()}&page=1&pageSize=30',
    );
    final mailKey = CacheKey(
      namespace: 'mail.list',
      userId: user,
      workspaceId: workspace,
      params: {'path': path},
    );
    expect(mailKey.value.length, lessThanOrEqualTo(255));
    for (final otherKey in [
      CacheKey(
        namespace: 'mail.list',
        userId: 'other',
        workspaceId: workspace,
        params: {'path': path},
      ),
      CacheKey(
        namespace: 'mail.list',
        userId: user,
        workspaceId: 'other',
        params: {'path': path},
      ),
      CacheKey(
        namespace: 'mail.list',
        userId: user,
        workspaceId: workspace,
        params: {'path': '$path&label=other'},
      ),
    ]) {
      expect(otherKey.value, isNot(mailKey.value));
    }
    final result = await cacheStore.prefetch(
      key: mailKey,
      policy: CachePolicies.detail,
      decode: decode,
      fetch: () async => 'inbox data',
      tags: ['mail'],
    );
    expect(result.data, 'inbox data');
    await cacheStore.closeForTesting();
    cacheStore = CacheStore.forTesting(
      secureStorage: secureStorage,
      directoryResolver: () async => tempDir,
    );
    expect(
      (await cacheStore.read(key: mailKey, decode: decode)).data,
      'inbox data',
    );
    await cacheStore.invalidateTags(
      ['mail'],
      userId: user,
      workspaceId: workspace,
    );
    expect(
      (await cacheStore.read(key: mailKey, decode: decode)).isFresh,
      isFalse,
    );
    await cacheStore.remove(mailKey);
    expect(
      (await cacheStore.read(key: mailKey, decode: decode)).hasValue,
      isFalse,
    );
  });

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
    await pending;
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
      await pending;
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
