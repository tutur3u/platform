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
}
