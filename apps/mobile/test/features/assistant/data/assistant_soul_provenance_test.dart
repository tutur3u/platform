import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_soul_name_writer.dart';
import 'package:mobile/features/assistant/data/assistant_soul_reader.dart';
import 'package:mobile/features/assistant/data/assistant_soul_receipts.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Repository extends Mock implements AssistantRepository {}

class _HeldQueue extends OfflineMutationQueue {
  _HeldQueue({required super.store, required super.userId, bool online = false})
    : super.forTesting(
        checkConnectivity: () async => [
          if (online) ConnectivityResult.wifi else ConnectivityResult.none,
        ],
        connectivityChanges: const Stream.empty(),
      );
  Completer<void>? gate;
  Completer<void>? started;
  @override
  Future<List<PendingMutationRecord>> listPending() async {
    if (started != null && !started!.isCompleted) started!.complete();
    await gate?.future;
    return await super.listPending();
  }
}

class _Api extends ApiClient {
  @override
  Future<Map<String, dynamic>> patchJson(
    String path,
    Map<String, dynamic> body, {
    bool requiresAuth = true,
  }) async => {
    'soul': {'name': body['name'], 'user_id': 'actor-a'},
  };
  int calls = 0;
  Completer<Map<String, dynamic>>? held;
  final started = Completer<void>();
  Exception? error;
  Object? receipt = {'name': 'Confirmed', 'user_id': 'actor-a'};
  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
  }) async {
    calls++;
    if (!started.isCompleted) started.complete();
    if (error != null) throw error!;
    return await held?.future ?? {'soul': receipt};
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late _HeldQueue queue;
  late _Api api;
  late _Storage storage;
  late Map<String, String?> secureValues;
  String? actor;
  Completer<void>? initGate;
  setUp(() async {
    actor = 'actor-a';
    initGate = null;
    directory = await Directory.systemTemp.createTemp('soul-provenance-');
    storage = _Storage();
    secureValues = {};
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((call) async => secureValues[call.namedArguments[#key]]);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      secureValues[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String?;
    });
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async {
        await initGate?.future;
        return directory;
      },
    );
    queue = _HeldQueue(store: store, userId: () => actor);
    api = _Api();
  });
  tearDown(() async {
    await queue.dispose();
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });
  for (final status in PendingMutationStatus.values) {
    test('$status intent never replaces authoritative name', () async {
      await queue.init();
      await queue.synchronize();
      await queue.enqueue(
        PendingMutationRecord(
          id: 'intent-${status.name}',
          feature: 'assistant',
          method: 'PATCH',
          path: '/api/v1/mira/soul',
          createdAt: DateTime.utc(2026),
          userId: actor,
          workspaceId: 'personal',
          payload: {'name': 'Pending'},
          status: status,
        ),
      );
      final soul = await fetchAssistantSoul(
        AssistantRepository(apiClient: api),
        forceRefresh: true,
        store: store,
        queue: queue,
        currentUserId: () => actor,
      );
      expect(soul.name, 'Confirmed');
      expect((await queue.listPending()).single.status, status);
    });
  }
  test('actor departure during initialization admits no GET', () async {
    initGate = Completer<void>();
    final pending = fetchAssistantSoul(
      AssistantRepository(apiClient: api),
      forceRefresh: true,
      store: store,
      queue: queue,
      currentUserId: () => actor,
    );
    final rejection = expectLater(pending, throwsStateError);
    await Future<void>.delayed(Duration.zero);
    actor = 'actor-b';
    initGate!.complete();
    await rejection;
    expect(api.calls, 0);
  });
  AssistantSoulReader reader() => AssistantSoulReader(
    apiClient: api,
    store: store,
    queue: queue,
    currentUserId: () => actor,
  );
  test(
    'held network clear and same actor restore never publishes old receipt',
    () async {
      api.held = Completer<Map<String, dynamic>>();
      final pending = reader().read(forceRefresh: true);
      final rejection = expectLater(pending, throwsStateError);
      await api.started.future;
      actor = null;
      await store.clearResources(userId: 'actor-a');
      actor = 'actor-a';
      api.held!.complete({
        'soul': {'name': 'Old', 'user_id': 'actor-a'},
      });
      await rejection;
      expect(
        (await store.read(
          key: verifiedSoulKey('actor-a'),
          decode: (json) => decodeVerifiedSoul(json, 'actor-a'),
        )).data,
        isNull,
      );
    },
  );
  for (final receipt in <Object?>[
    null,
    {},
    {'name': 1},
    {'name': 'Other', 'user_id': 'actor-b'},
    {'name': 'Valid', 'tone': 1},
  ]) {
    test('malformed or foreign receipt $receipt is never confirmed', () async {
      api.receipt = receipt;
      await expectLater(
        reader().read(forceRefresh: true),
        throwsFormatException,
      );
    });
  }
  test('403 remains authoritative and retains failed intent', () async {
    await queue.init();
    await queue.synchronize();
    await queue.enqueue(
      PendingMutationRecord(
        id: 'failed',
        feature: 'assistant',
        method: 'PATCH',
        path: assistantSoulPath,
        createdAt: DateTime.utc(2026),
        userId: actor,
        workspaceId: 'personal',
        payload: {'name': 'Pending'},
        status: PendingMutationStatus.failed,
      ),
    );
    api.error = const ApiException(message: 'Denied', statusCode: 403);
    await expectLater(
      reader().read(forceRefresh: true),
      throwsA(same(api.error)),
    );
    expect(
      (await queue.listPending()).single.status,
      PendingMutationStatus.failed,
    );
  });
  test(
    'offline writer survives restart without promoting local intent',
    () async {
      await store.write(
        key: verifiedSoulKey('actor-a'),
        policy: CachePolicies.metadata,
        payload: verifiedSoulPayload(
          const AssistantSoul(name: 'Confirmed'),
          'actor-a',
        ),
      );
      final writer = AssistantSoulNameWriter(
        apiClient: api,
        store: store,
        queue: queue,
        currentUserId: () => actor,
      );
      final local = await writer.renameSnapshot('Pending');
      expect(local.verifiedSoul?.name, 'Confirmed');
      expect(local.pendingIntents.single.name, 'Pending');
      await queue.dispose();
      await store.closeForTesting();
      store = CacheStore.forTesting(
        secureStorage: storage,
        directoryResolver: () async => directory,
      );
      queue = _HeldQueue(store: store, userId: () => actor);
      api.error = const SocketException('Offline');
      final restored = await reader().read();
      expect(restored.verifiedSoul?.name, 'Confirmed');
      expect(restored.pendingIntents.single.name, 'Pending');
      expect(
        restored.pendingIntents.single.status,
        PendingMutationStatus.queued,
      );
      await queue.synchronize();
    },
  );
  test('legacy optimistic cache is never promoted as verified', () async {
    await store.write(
      key: CacheKey(
        namespace: 'assistant.soul',
        userId: actor,
        locale: verifiedSoulKey('actor-a').locale,
      ),
      policy: CachePolicies.metadata,
      payload: const AssistantSoul(name: 'Legacy pending').toJson(),
    );
    final result = await reader().read(forceRefresh: true);
    expect(result.verifiedSoul?.name, 'Confirmed');
    expect(api.calls, 1);
  });
  for (final clear in [false, true]) {
    test('held pending list rejects actor departure clear=$clear', () async {
      await queue.init();
      await queue.synchronize();
      queue
        ..gate = Completer<void>()
        ..started = Completer<void>();
      final pending = reader().read(forceRefresh: true);
      final rejection = expectLater(pending, throwsStateError);
      await queue.started!.future;
      actor = 'actor-b';
      if (clear) {
        await store.clearResources(userId: 'actor-a');
        actor = 'actor-a';
      }
      queue.gate!.complete();
      await rejection;
    });
  }
  test(
    'Shell offline rename retains confirmed header with real provenance',
    () async {
      SharedPreferences.setMockInitialValues({});
      final repository = _Repository();
      when(
        repository.fetchSoul,
      ).thenAnswer((_) async => (await reader().read()).displaySoul);
      when(
        repository.resolvePersonalWorkspaceId,
      ).thenAnswer((_) async => 'personal');
      when(
        () => repository.fetchTasksInsight(
          wsId: any(named: 'wsId'),
          isPersonal: any(named: 'isPersonal'),
        ),
      ).thenAnswer((_) async => const AssistantTasksInsight());
      when(
        () => repository.fetchCalendarInsight(any()),
      ).thenAnswer((_) async => const AssistantCalendarInsight());
      when(
        () => repository.fetchCredits(
          any(),
          forceRefresh: any(named: 'forceRefresh'),
        ),
      ).thenAnswer((_) async => const AssistantCredits());
      when(repository.fetchGatewayModels).thenAnswer((_) async => []);
      final writer = AssistantSoulNameWriter(
        apiClient: api,
        store: store,
        queue: queue,
        currentUserId: () => actor,
      );
      when(
        () => repository.updateSoulNameSnapshot('Pending'),
      ).thenAnswer((_) => writer.renameSnapshot('Pending'));
      final shell = AssistantShellCubit(
        repository: repository,
        preferences: AssistantPreferences(currentUserId: () => actor),
      );
      try {
        await shell.loadWorkspace(const Workspace(id: 'ws'));
        expect(shell.state.soul.name, 'Confirmed');
        await shell.renameAssistant('Pending');
        expect(shell.state.soul.name, 'Confirmed');
        expect(shell.state.soulSnapshot?.verifiedSoul?.name, 'Confirmed');
        expect(shell.state.soulSnapshot?.pendingIntents.single.name, 'Pending');
        expect((await queue.listPending()).single.payload, {'name': 'Pending'});
      } finally {
        await shell.close();
      }
    },
  );
  test('older GET cannot overwrite a later confirmed rename', () async {
    await queue.dispose();
    queue = _HeldQueue(store: store, userId: () => actor, online: true);
    api.held = Completer<Map<String, dynamic>>();
    final pending = reader().read(forceRefresh: true);
    final rejected = expectLater(pending, throwsStateError);
    await api.started.future;
    final writer = AssistantSoulNameWriter(
      apiClient: api,
      store: store,
      queue: queue,
      currentUserId: () => actor,
    );
    final confirmed = await writer.renameSnapshot('New');
    expect(confirmed.verifiedSoul?.name, 'New');
    api.held!.complete({
      'soul': {'name': 'Old', 'user_id': 'actor-a'},
    });
    await rejected;
    expect(
      (await store.read(
        key: verifiedSoulKey('actor-a'),
        decode: (json) => decodeVerifiedSoul(json, 'actor-a'),
      )).data?.name,
      'New',
    );
  });
}
