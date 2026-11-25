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

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late _Api api;
  const path = '/api/v1/workspaces/ws/example';
  const key = CacheKey(
    namespace: 'example.source',
    userId: 'owner',
    workspaceId: 'ws',
    params: {'path': path},
  );

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('read-source-test-');
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
    api = _Api();
    when(() => api.checkUser(any())).thenReturn(null);
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  Future<({Map<String, dynamic> data, bool fromCache})> read({
    bool forceRefresh = false,
  }) => readThroughJsonResult(
    api: api,
    namespace: key.namespace,
    workspaceId: 'ws',
    path: path,
    cacheStore: store,
    cacheUserId: () => 'owner',
    forceRefresh: forceRefresh,
  );

  test('a network read reports it did not come from the cache', () async {
    when(() => api.getJson(path)).thenAnswer((_) async => {'value': 'live'});
    final result = await read(forceRefresh: true);
    expect(result.data, {'value': 'live'});
    expect(result.fromCache, isFalse);
  });

  test('a cached snapshot reports it came from the cache', () async {
    await store.write(
      key: key,
      policy: CachePolicies.moduleData,
      payload: {'value': 'cached'},
    );
    when(() => api.getJson(path)).thenAnswer((_) async => {'value': 'live'});
    final result = await read();
    expect(result.data, {'value': 'cached'});
    expect(result.fromCache, isTrue);
  });

  test('a read invalidated mid-flight is not a network read', () async {
    final response = Completer<Map<String, dynamic>>();
    when(() => api.getJson(path)).thenAnswer((_) => response.future);

    final pending = read();
    await Future<void>.delayed(const Duration(milliseconds: 10));
    await store.remove(key);
    response.complete({'value': 'superseded'});
    final result = await pending;

    expect(result.data, isEmpty);
    expect(result.fromCache, isTrue);
  });
}
