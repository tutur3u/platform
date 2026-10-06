import 'dart:async';
import 'dart:io';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_soul_name_writer.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Api extends ApiClient {
  final started = Completer<void>();
  final response = Completer<Map<String, dynamic>>();
  int calls = 0;
  @override
  Future<Map<String, dynamic>> patchJson(
    String path,
    Map<String, dynamic> body, {
    bool requiresAuth = true,
  }) {
    calls++;
    started.complete();
    return response.future;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late OfflineMutationQueue queue;
  late AssistantSoulNameWriter writer;
  late _Api api;
  String? actor;
  Completer<void>? directoryGate;
  Completer<List<ConnectivityResult>>? connectivityGate;
  late Completer<void> connectivityStarted;
  setUp(() async {
    actor = 'actor-a';
    directoryGate = null;
    connectivityGate = null;
    connectivityStarted = Completer<void>();
    directory = await Directory.systemTemp.createTemp('soul-name-');
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
      directoryResolver: () async {
        await directoryGate?.future;
        return directory;
      },
    );
    queue = OfflineMutationQueue.forTesting(
      store: store,
      userId: () => actor,
      checkConnectivity: () async {
        if (!connectivityStarted.isCompleted) connectivityStarted.complete();
        return await connectivityGate?.future ?? [ConnectivityResult.wifi];
      },
      connectivityChanges: const Stream.empty(),
    );
    api = _Api();
    writer = AssistantSoulNameWriter(
      apiClient: api,
      store: store,
      queue: queue,
      currentUserId: () => actor,
    );
  });
  tearDown(() async {
    await queue.dispose();
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });
  AssistantSoul? snapshot() => store
      .peek<AssistantSoul>(
        key: writer.key,
        decode: AssistantSoulNameWriter.decode,
      )
      .data;
  test(
    'actor switch during cache initialization admits no network write',
    () async {
      directoryGate = Completer<void>();
      final pending = writer.rename('Nova');
      final check = expectLater(pending, throwsStateError);
      await Future<void>.delayed(Duration.zero);
      actor = 'actor-b';
      directoryGate!.complete();
      api.response.complete({
        'soul': {'name': 'Nova'},
      });
      await check;
      expect(api.calls, 0);
    },
  );
  test('late reply cannot populate successor actor cache', () async {
    final pending = writer.rename('Nova');
    final check = expectLater(pending, throwsStateError);
    await api.started.future;
    actor = 'actor-b';
    api.response.complete({
      'soul': {'name': 'Nova'},
    });
    await check;
    expect(snapshot(), isNull);
  });
  test('logout clear and same actor restoration reject old reply', () async {
    final pending = writer.rename('Old');
    final check = expectLater(pending, throwsStateError);
    await api.started.future;
    actor = null;
    await store.clearScope(userId: 'actor-a');
    actor = 'actor-a';
    await store.write(
      key: writer.key,
      policy: CachePolicies.metadata,
      payload: const AssistantSoul(name: 'Current').toJson(),
    );
    api.response.complete({
      'soul': {'name': 'Old'},
    });
    await check;
    expect(snapshot()?.name, 'Current');
  });
  test(
    'held offline admission cannot enqueue different actor intent',
    () async {
      await queue.init();
      await queue.synchronize();
      connectivityGate = Completer<List<ConnectivityResult>>();
      connectivityStarted = Completer<void>();
      final pending = writer.rename('Nova');
      final check = expectLater(pending, throwsStateError);
      await connectivityStarted.future;
      actor = 'actor-b';
      connectivityGate!.complete([ConnectivityResult.none]);
      await check;
      expect(queue.pending.value, isEmpty);
      expect(api.calls, 0);
    },
  );
  test(
    'held offline admission rejects logout and same actor restoration',
    () async {
      await queue.init();
      await queue.synchronize();
      connectivityGate = Completer<List<ConnectivityResult>>();
      connectivityStarted = Completer<void>();
      final pending = writer.rename('Old');
      final check = expectLater(pending, throwsStateError);
      await connectivityStarted.future;
      actor = null;
      await store.clearScope(userId: 'actor-a');
      actor = 'actor-a';
      connectivityGate!.complete([ConnectivityResult.none]);
      await check;
      expect(queue.pending.value, isEmpty);
      expect(await store.listPendingMutations(), isEmpty);
      expect(api.calls, 0);
    },
  );

  for (final receipt in <Object?>[
    null,
    {},
    {'name': ''},
    {'name': 42},
    {'name': 'Nova', 'tone': 42},
    {'name': 'Nova', 'user_id': 'actor-b'},
  ]) {
    test('rejects unconfirmed name receipt $receipt', () async {
      final pending = writer.rename('Nova');
      final check = expectLater(pending, throwsFormatException);
      await api.started.future;
      api.response.complete({'soul': receipt});
      await check;
      expect(snapshot(), isNull);
    });
  }
  test(
    'successor rename cannot be overwritten by earlier network reply',
    () async {
      final pending = writer.rename('Old');
      final check = expectLater(pending, throwsStateError);
      await api.started.future;
      final nextApi = _Api();
      final nextWriter = AssistantSoulNameWriter(
        apiClient: nextApi,
        store: store,
        queue: queue,
        currentUserId: () => actor,
      );
      final next = nextWriter.rename('Current');
      await nextApi.started.future;
      nextApi.response.complete({
        'soul': {'name': 'Current'},
      });
      await next;
      api.response.complete({
        'soul': {'name': 'Old'},
      });
      await check;
      expect(snapshot()?.name, 'Current');
    },
  );
  test(
    'transport failure after logout ABA cannot store stale conflict',
    () async {
      final pending = writer.rename('Old');
      final check = expectLater(pending, throwsStateError);
      await api.started.future;
      actor = null;
      await store.clearScope(userId: 'actor-a');
      actor = 'actor-a';
      api.response.completeError(
        const ApiException.transport(message: 'Synthetic transport'),
      );
      await check;
      expect(await store.listPendingMutations(), isEmpty);
    },
  );
  test(
    'definitive permission failure stays an API error with no queue',
    () async {
      const error = ApiException(message: 'Synthetic denial', statusCode: 403);
      final pending = writer.rename('Nova');
      final check = expectLater(pending, throwsA(same(error)));
      await api.started.future;
      api.response.completeError(error);
      await check;
      expect(await store.listPendingMutations(), isEmpty);
      expect(snapshot(), isNull);
    },
  );
  test('offline name remains captured-owner pending intent', () async {
    await queue.init();
    await queue.synchronize();
    connectivityGate = Completer<List<ConnectivityResult>>()
      ..complete([ConnectivityResult.none]);
    expect((await writer.rename('Nova')).name, 'Nova');
    final records = await store.listPendingMutations();
    expect(records.single.userId, 'actor-a');
    expect(records.single.payload, {'name': 'Nova'});
    expect(records.single.replaySafe, isFalse);
    expect(api.calls, 0);
  });

  test('confirmed reply writes owner snapshot', () async {
    final pending = writer.rename('Nova');
    await api.started.future;
    api.response.complete({
      'soul': {'name': 'Nova', 'tone': 'warm'},
    });
    expect((await pending).name, 'Nova');
    expect(snapshot()?.name, 'Nova');
  });
}
