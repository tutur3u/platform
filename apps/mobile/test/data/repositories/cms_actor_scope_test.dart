import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/repositories/cms_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Api extends Mock implements ApiClient {}

class _Queue extends Mock implements OfflineMutationQueue {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late _Api api;
  late _Queue queue;
  late CmsRepository repository;
  late String actor;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('cms-actor-');
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
    queue = _Queue();
    actor = 'owner';
    when(() => api.checkUser(any())).thenAnswer((call) {
      if (call.positionalArguments.single != actor) {
        throw const ApiException(message: 'Account changed', statusCode: 401);
      }
    });
    repository = CmsRepository(
      apiClient: api,
      cacheStore: store,
      mutationQueue: queue,
      expectedUserId: 'owner',
    );
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  for (final collections in [true, false]) {
    final path = collections
        ? CmsEndpoints.collections('ws')
        : CmsEndpoints.entries('ws');
    Future<List<String>> read() async => collections
        ? (await repository.listCollections(
            'ws',
            forceRefresh: true,
          )).map((row) => row.id).toList()
        : (await repository.listEntries(
            'ws',
            forceRefresh: true,
          )).map((row) => row.id).toList();
    PendingMutationRecord pending(String user, String id) =>
        PendingMutationRecord(
          id: id,
          feature: 'cms',
          method: 'POST',
          path: path,
          userId: user,
          workspaceId: 'ws',
          createdAt: DateTime.utc(2026),
          optimisticPatch: {'entityId': id},
          payload: {
            'id': id,
            'title': id,
            'slug': id,
            'collection_type': 'articles',
            'collection_id': 'collection',
            'status': 'draft',
          },
        );
    test(
      '${collections ? 'collections' : 'entries'} overlays only owner edits',
      () async {
        when(() => api.getJsonList(path)).thenAnswer((_) async => []);
        when(() => queue.listPending()).thenAnswer(
          (_) async => [pending('owner', 'mine'), pending('other', 'private')],
        );
        expect(await read(), ['mine']);
      },
    );
    test(
      '${collections ? 'collections' : 'entries'} fences delayed queue read',
      () async {
        final entered = Completer<void>();
        final pendingRead = Completer<List<PendingMutationRecord>>();
        when(() => api.getJsonList(path)).thenAnswer((_) async => []);
        when(() => queue.listPending()).thenAnswer((_) {
          entered.complete();
          return pendingRead.future;
        });
        final result = read();
        final assertion = expectLater(result, throwsA(isA<ApiException>()));
        await entered.future;
        actor = 'other';
        pendingRead.complete([pending('owner', 'mine')]);
        await assertion;
      },
    );
  }
  test(
    'unbound caller retains the original actor through queue access',
    () async {
      repository = CmsRepository(
        apiClient: api,
        cacheStore: store,
        mutationQueue: queue,
        currentUserId: () => actor,
      );
      final response = Completer<List<dynamic>>();
      final entered = Completer<void>();
      when(() => api.getJsonList(CmsEndpoints.collections('ws'))).thenAnswer((
        _,
      ) {
        entered.complete();
        return response.future;
      });
      when(() => queue.listPending()).thenAnswer((_) async => []);
      final read = repository.listCollections('ws', forceRefresh: true);
      final assertion = expectLater(read, throwsA(isA<ApiException>()));
      await entered.future;
      actor = 'other';
      response.complete([]);
      await assertion;
      verifyNever(() => queue.listPending());
    },
  );
  test('anonymous summary request cannot publish after sign-in', () async {
    String? cacheActor;
    repository = CmsRepository(
      apiClient: api,
      cacheStore: store,
      mutationQueue: queue,
      currentUserId: () => cacheActor,
    );
    final response = Completer<Map<String, dynamic>>();
    final entered = Completer<void>();
    when(() => api.getJson(CmsEndpoints.summary('ws'))).thenAnswer((_) {
      entered.complete();
      return response.future;
    });
    final read = repository.getSummary('ws');
    final assertion = expectLater(read, throwsA(isA<ApiException>()));
    await entered.future;
    cacheActor = 'owner';
    response.complete({});
    await assertion;
  });
  test('departed actor cannot start a collection write', () async {
    actor = 'other';
    await expectLater(
      repository.createCollection(
        'ws',
        title: 'Draft',
        slug: 'draft',
        collectionType: 'articles',
      ),
      throwsA(isA<ApiException>()),
    );
    verifyNever(() => queue.listPending());
    verifyNever(() => api.postJson(any(), any()));
  });
  test(
    'departed actor cannot read summary from the previous repository',
    () async {
      actor = 'other';
      await expectLater(
        repository.getSummary('ws'),
        throwsA(isA<ApiException>()),
      );
      verifyNever(() => api.getJson(any()));
    },
  );
}
