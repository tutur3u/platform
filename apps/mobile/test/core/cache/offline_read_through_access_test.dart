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
  late _Storage storage;
  late CacheStore store;
  late _Api api;
  late String actor;
  const path = '/api/v1/workspaces/ws/example';
  const key = CacheKey(
    namespace: 'example.list',
    userId: 'owner',
    workspaceId: 'ws',
    params: {'path': path},
  );
  CacheStore createStore() => CacheStore.forTesting(
    secureStorage: storage,
    directoryResolver: () async => directory,
  );

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('read-access-test-');
    storage = _Storage();
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
    store = createStore();
    api = _Api();
    actor = 'owner';
    when(() => api.checkUser(any())).thenAnswer((call) {
      if (actor != call.positionalArguments.single) {
        throw const ApiException(message: 'Actor changed', statusCode: 401);
      }
    });
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  for (final list in [false, true]) {
    final payload = list ? <dynamic>['authorized'] : {'value': 'authorized'};
    Future<Object> read() => list
        ? readThroughJsonList(
            api: api,
            namespace: key.namespace,
            workspaceId: 'ws',
            path: path,
            cacheStore: store,
            cacheUserId: () => actor,
            forceRefresh: true,
          )
        : readThroughJson(
            api: api,
            namespace: key.namespace,
            workspaceId: 'ws',
            path: path,
            cacheStore: store,
            cacheUserId: () => actor,
            forceRefresh: true,
          );
    void failWith(ApiException error) {
      if (list) {
        when(() => api.getJsonList(path)).thenThrow(error);
      } else {
        when(() => api.getJson(path)).thenThrow(error);
      }
    }

    for (final error in [
      const ApiException(message: 'MFA', statusCode: 403, code: 'MFA_REQUIRED'),
      const ApiException(
        message: 'Challenge',
        statusCode: 403,
        isVerificationRequired: true,
      ),
      const ApiException(message: 'Rate limited', statusCode: 429),
      const ApiException(message: 'Server unavailable', statusCode: 503),
    ]) {
      test(
        '${list ? 'list' : 'map'} retains durable cache for ${error.message}',
        () async {
          await store.write(
            key: key,
            policy: CachePolicies.moduleData,
            payload: payload,
          );
          failWith(error);
          await expectLater(read(), throwsA(same(error)));
          await store.closeForTesting();
          store = createStore();
          final retained = await store.read<Object>(
            key: key,
            decode: (v) => v!,
          );
          expect(retained.data, payload);
        },
      );
    }
    for (final status in [401, 403]) {
      test(
        '${list ? 'list' : 'map'} durably purges definitive $status',
        () async {
          await store.write(
            key: key,
            policy: CachePolicies.moduleData,
            payload: payload,
          );
          final denied = ApiException(message: 'Denied', statusCode: status);
          failWith(denied);
          await expectLater(read(), throwsA(same(denied)));
          await store.closeForTesting();
          store = createStore();
          final removed = await store.read<Object>(key: key, decode: (v) => v!);
          expect(removed.hasValue, isFalse);
        },
      );
    }
    test(
      '${list ? 'list' : 'map'} obsolete denial cannot purge new snapshot',
      () async {
        await store.write(
          key: key,
          policy: CachePolicies.moduleData,
          payload: payload,
        );
        final response = Completer<dynamic>();
        final entered = Completer<void>();
        if (list) {
          when(() => api.getJsonList(path)).thenAnswer((_) async {
            entered.complete();
            return (await response.future) as List<dynamic>;
          });
        } else {
          when(() => api.getJson(path)).thenAnswer((_) async {
            entered.complete();
            return (await response.future) as Map<String, dynamic>;
          });
        }
        final request = read();
        final expectation = expectLater(request, throwsA(isA<ApiException>()));
        await entered.future;
        actor = 'next';
        await store.write(
          key: key,
          policy: CachePolicies.moduleData,
          payload: list ? <dynamic>['new'] : {'value': 'new'},
        );
        response.completeError(
          const ApiException(message: 'Old denied', statusCode: 403),
        );
        await expectation;
        final retained = await store.read<Object>(key: key, decode: (v) => v!);
        expect(retained.data, list ? <dynamic>['new'] : {'value': 'new'});
      },
    );
  }
}
