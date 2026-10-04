import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Api extends Mock implements ApiClient {}

String? _firstId(List<dynamic> rows) =>
    (rows.single as Map<String, dynamic>)['id'] as String?;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late _Api api;
  const path = '/api/workspaces/ws/wallets';
  const key = CacheKey(
    namespace: 'finance.wallets',
    userId: 'user',
    workspaceId: 'ws',
    params: {'path': path},
  );
  Future<List<dynamic>> read() => readThroughJsonList(
    api: api,
    namespace: 'finance.wallets',
    workspaceId: 'ws',
    path: path,
    cacheStore: store,
    cacheUserId: () => 'user',
  );
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('cache-revalidation-');
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
    api = _Api();
    await store.write(
      key: key,
      policy: CachePolicies.moduleData,
      payload: const [
        {'id': 'old'},
      ],
    );
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });
  test('clear during replica indexing cannot resurrect cleared rows', () async {
    const target = CacheKey(
      namespace: 'finance.wallets',
      userId: 'user',
      workspaceId: 'ws',
      params: {'path': '/indexing'},
    );
    var checks = 0;
    Future<void>? clearing;
    final writing = store.write(
      key: target,
      policy: CachePolicies.moduleData,
      payload: const [
        {'id': 'late'},
      ],
      checkScope: () {
        checks++;
        if (checks == 5) {
          clearing = store.clearScope(
            userId: 'user',
            workspaceId: 'ws',
            namespace: 'finance.wallets',
            resourceOnly: true,
          );
        }
      },
    );
    await expectLater(writing, throwsStateError);
    expect(clearing, isNotNull);
    await clearing;
    expect(
      await store.queryReplica(
        namespace: 'finance.wallets',
        userId: 'user',
        workspaceId: 'ws',
      ),
      isEmpty,
    );
    expect(store.peek(key: target, decode: (raw) => raw).hasValue, isFalse);
    await store.write(
      key: target,
      policy: CachePolicies.moduleData,
      payload: const [
        {'id': 'new'},
      ],
    );
    expect(
      (await store.queryReplica(
        namespace: 'finance.wallets',
        userId: 'user',
        workspaceId: 'ws',
      )).single.id,
      'new',
    );
  });

  test(
    'invalidated replica rollback preserves a newer same-key writer',
    () async {
      const target = CacheKey(
        namespace: 'finance.wallets',
        userId: 'user',
        workspaceId: 'ws',
        params: {'path': '/concurrent'},
      );
      var checks = 0;
      Future<void>? newer;
      final older = store.write(
        key: target,
        policy: CachePolicies.moduleData,
        payload: const [
          {'id': 'older'},
        ],
        checkScope: () {
          if (++checks == 5) {
            newer = store.write(
              key: target,
              policy: CachePolicies.moduleData,
              payload: const [
                {'id': 'newer'},
              ],
            );
          }
        },
      );
      await expectLater(older, throwsStateError);
      expect(newer, isNotNull);
      await newer;
      final rows = await store.queryReplica(
        namespace: 'finance.wallets',
        userId: 'user',
        workspaceId: 'ws',
      );
      expect(rows.map((row) => row.id), unorderedEquals(['old', 'newer']));
    },
  );

  test('owner change during persistence stops replica publication', () async {
    const target = CacheKey(
      namespace: 'finance.wallets',
      userId: 'user',
      workspaceId: 'ws',
      params: {'path': '/owner'},
    );
    var checks = 0;
    await expectLater(
      store.write(
        key: target,
        policy: CachePolicies.moduleData,
        payload: const [
          {'id': 'late-owner'},
        ],
        checkScope: () {
          if (++checks == 2) throw StateError('Account changed');
        },
      ),
      throwsStateError,
    );
    final rows = await store.queryReplica(
      namespace: 'finance.wallets',
      userId: 'user',
      workspaceId: 'ws',
    );
    expect(rows.any((row) => row.id == 'late-owner'), isFalse);
    expect(rows.single.id, 'old');
  });

  test('local snapshot cannot replace reconnect network refresher', () async {
    when(() => api.getJsonList(path)).thenAnswer(
      (_) async => [
        {'id': 'network'},
      ],
    );
    await CacheStore.awaitRevalidation(read);
    await store.prefetch<List<dynamic>>(
      key: key,
      policy: CachePolicies.moduleData,
      registerRefresh: false,
      forceRefresh: true,
      decode: (raw) => List<dynamic>.from(raw! as List),
      fetch: () async => [
        {'id': 'local'},
      ],
    );
    await store.refreshCachedResources(currentUserId: () => 'user');
    verify(() => api.getJsonList(path)).called(2);
    final saved = await store.read<List<dynamic>>(
      key: key,
      decode: (raw) => List<dynamic>.from(raw! as List),
    );
    expect(_firstId(saved.data!), 'network');
  });

  test(
    'stable cache owner still checks live API identity before persistence',
    () async {
      var authenticatedOwner = 'user';
      when(() => api.checkUser('user')).thenAnswer((_) {
        if (authenticatedOwner != 'user') {
          throw const ApiException(message: 'Account changed', statusCode: 401);
        }
      });
      final response = Completer<List<dynamic>>();
      when(() => api.getJsonList(path)).thenAnswer((_) => response.future);
      final result = CacheStore.awaitRevalidation(read);
      await Future<void>.delayed(Duration.zero);
      authenticatedOwner = 'other';
      response.complete([
        {'id': 'other-secret'},
      ]);
      await expectLater(
        result,
        throwsA(
          isA<ApiException>().having((e) => e.statusCode, 'statusCode', 401),
        ),
      );
      final saved = await store.read<List<dynamic>>(
        key: key,
        decode: (raw) => List<dynamic>.from(raw! as List),
      );
      expect(saved.data?.toString().contains('other-secret') ?? false, isFalse);
    },
  );

  test(
    'JSON object read rejects an account switch before cache publication',
    () async {
      var owner = 'user';
      final response = Completer<Map<String, dynamic>>();
      when(() => api.getJson(path)).thenAnswer((_) => response.future);
      final result = readThroughJson(
        api: api,
        namespace: 'finance.summary',
        workspaceId: 'ws',
        path: path,
        cacheStore: store,
        cacheUserId: () => owner,
      );
      await Future<void>.delayed(Duration.zero);
      owner = 'other';
      response.complete({'id': 'other-secret'});
      await expectLater(
        result,
        throwsA(
          isA<ApiException>().having((e) => e.statusCode, 'statusCode', 401),
        ),
      );
      final saved = await store.read<Map<String, dynamic>>(
        key: const CacheKey(
          namespace: 'finance.summary',
          userId: 'user',
          workspaceId: 'ws',
          params: {'path': path},
        ),
        decode: (raw) => Map<String, dynamic>.from(raw! as Map),
      );
      expect(saved.hasValue, isFalse);
    },
  );

  test(
    'account switch rejects fresh list and never caches new-account data',
    () async {
      var owner = 'user';
      final response = Completer<List<dynamic>>();
      when(() => api.getJsonList(path)).thenAnswer((_) => response.future);
      final result = CacheStore.awaitRevalidation(
        () => readThroughJsonList(
          api: api,
          namespace: key.namespace,
          workspaceId: 'ws',
          path: path,
          cacheStore: store,
          cacheUserId: () => owner,
        ),
      );
      await Future<void>.delayed(Duration.zero);
      owner = 'other';
      response.complete([
        {'id': 'other-secret'},
      ]);
      await expectLater(
        result,
        throwsA(
          isA<ApiException>().having((e) => e.statusCode, 'statusCode', 401),
        ),
      );
      final cached = await store.read<List<dynamic>>(
        key: key,
        decode: (raw) => List<dynamic>.from(raw! as List),
      );
      expect(
        cached.data?.toString().contains('other-secret') ?? false,
        isFalse,
      );
    },
  );

  test(
    'account switch cannot fall back to prior cached list on transport failure',
    () async {
      var owner = 'user';
      final response = Completer<List<dynamic>>();
      when(() => api.getJsonList(path)).thenAnswer((_) => response.future);
      final result = CacheStore.awaitRevalidation(
        () => readThroughJsonList(
          api: api,
          namespace: key.namespace,
          workspaceId: 'ws',
          path: path,
          cacheStore: store,
          cacheUserId: () => owner,
        ),
      );
      await Future<void>.delayed(Duration.zero);
      owner = 'other';
      response.completeError(const SocketException('offline'));
      await expectLater(
        result,
        throwsA(
          isA<ApiException>().having((e) => e.statusCode, 'statusCode', 401),
        ),
      );
    },
  );

  test(
    'cached phase is immediate and revalidation awaits shared fresh response',
    () async {
      final network = Completer<List<dynamic>>();
      when(() => api.getJsonList(path)).thenAnswer((_) => network.future);
      final cached = await read();
      expect(_firstId(cached), 'old');
      var finished = false;
      final fresh = CacheStore.awaitRevalidation(read).then((value) {
        finished = true;
        return value;
      });
      await Future<void>.delayed(Duration.zero);
      expect(finished, isFalse);
      expect(CacheStore.awaitingRevalidation, isFalse);
      network.complete([
        {'id': 'fresh'},
      ]);
      expect(_firstId(await fresh), 'fresh');
      verify(() => api.getJsonList(path)).called(1);
    },
  );
  test(
    'transport failure keeps scoped snapshot without renewing its timestamp',
    () async {
      final before = await store.read<Object>(
        key: key,
        decode: (value) => value!,
      );
      when(
        () => api.getJsonList(path),
      ).thenThrow(const SocketException('Offline'));
      expect(_firstId(await CacheStore.awaitRevalidation(read)), 'old');
      final after = await store.read<Object>(
        key: key,
        decode: (value) => value!,
      );
      expect(after.fetchedAt, before.fetchedAt);
    },
  );
  test(
    'permission denial propagates and clears inaccessible snapshot',
    () async {
      const denied = ApiException(message: 'Denied', statusCode: 403);
      when(() => api.getJsonList(path)).thenThrow(denied);
      await expectLater(
        CacheStore.awaitRevalidation(read),
        throwsA(same(denied)),
      );
      expect(
        (await store.read<Object>(
          key: key,
          decode: (value) => value!,
        )).hasValue,
        isFalse,
      );
    },
  );
  test(
    'verification challenge propagates while preserving offline snapshot',
    () async {
      const challenge = ApiException(
        message: 'Verification required',
        statusCode: 403,
        isVerificationRequired: true,
      );
      when(() => api.getJsonList(path)).thenThrow(challenge);
      await expectLater(
        CacheStore.awaitRevalidation(read),
        throwsA(same(challenge)),
      );
      expect(
        (await store.read<Object>(
          key: key,
          decode: (value) => value!,
        )).hasValue,
        isTrue,
      );
    },
  );
  test(
    'conditional two-phase read publishes cache and settles fresh data',
    () async {
      final network = Completer<List<dynamic>>();
      when(() => api.getJsonList(path)).thenAnswer((_) => network.future);
      final snapshots = <List<dynamic>>[];
      final result = CacheStore.readWithRevalidation(
        read,
        onSnapshot: snapshots.add,
      );
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(_firstId(snapshots.single), 'old');
      network.complete([
        {'id': 'fresh'},
      ]);
      expect(_firstId(await result), 'fresh');
      verify(() => api.getJsonList(path)).called(1);
    },
  );

  test('conditional two-phase read makes only one request when cold', () async {
    await store.remove(key);
    when(() => api.getJsonList(path)).thenAnswer(
      (_) async => [
        {'id': 'fresh'},
      ],
    );
    final snapshots = <List<dynamic>>[];
    final result = await CacheStore.readWithRevalidation(
      read,
      onSnapshot: snapshots.add,
    );
    expect(_firstId(result), 'fresh');
    expect(snapshots, isEmpty);
    verify(() => api.getJsonList(path)).called(1);
  });
  test('completed first-phase request is reused in the fresh phase', () async {
    when(() => api.getJsonList(path)).thenAnswer(
      (_) async => [
        {'id': 'fresh'},
      ],
    );
    final snapshots = <List<dynamic>>[];
    final result = await CacheStore.readWithRevalidation(() async {
      final value = await read();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      return value;
    }, onSnapshot: snapshots.add);
    expect(_firstId(snapshots.single), 'old');
    expect(_firstId(result), 'fresh');
    verify(() => api.getJsonList(path)).called(1);
  });

  test(
    'reconnect projection reuses completed refresh but next cycle refetches',
    () async {
      when(() => api.getJsonList(path)).thenAnswer(
        (_) async => [
          {'id': 'fresh'},
        ],
      );
      await CacheStore.awaitRevalidation(read);
      clearInteractions(api);
      await CacheStore.awaitRevalidation(() async {
        await store.refreshCachedResources(currentUserId: () => 'user');
        expect(
          _firstId(
            await CacheStore.readWithRevalidation(
              read,
              onSnapshot: (_) =>
                  fail('Fresh cycle must not publish stale phase'),
            ),
          ),
          'fresh',
        );
        expect(_firstId(await read()), 'fresh');
      });
      verify(() => api.getJsonList(path)).called(1);
      clearInteractions(api);
      await CacheStore.awaitRevalidation(read);
      verify(() => api.getJsonList(path)).called(1);
    },
  );

  test('invalidating during a refresh cycle forces a new request', () async {
    when(() => api.getJsonList(path)).thenAnswer(
      (_) async => [
        {'id': 'fresh'},
      ],
    );
    await CacheStore.awaitRevalidation(() async {
      await read();
      await store.remove(key);
      await read();
    });
    verify(() => api.getJsonList(path)).called(2);
  });
  test(
    'invalid domain payload cannot replace retained authorized snapshot',
    () async {
      await expectLater(
        store.prefetch<List<dynamic>>(
          key: key,
          policy: CachePolicies.moduleData,
          forceRefresh: true,
          decode: (raw) {
            if (raw is! List) throw const FormatException('Invalid list');
            return raw;
          },
          fetch: () async => {'wrong': 'shape'},
        ),
        throwsFormatException,
      );
      expect(
        _firstId(
          (await store.read<List<dynamic>>(
            key: key,
            decode: (raw) => raw! as List<dynamic>,
          )).data!,
        ),
        'old',
      );
      expect(
        (await store.queryReplica(
          namespace: key.namespace,
          userId: 'user',
          workspaceId: 'ws',
        )).single.id,
        'old',
      );
    },
  );
}
