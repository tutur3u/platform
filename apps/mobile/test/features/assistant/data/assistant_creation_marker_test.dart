import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';

class _Api extends Mock implements ApiClient {}

class _Chats extends Mock implements ChatRepository {}

class _FailedPreferenceWrite extends InMemorySharedPreferencesStore {
  _FailedPreferenceWrite(super.data) : super.withData();
  @override
  Future<bool> setValue(String valueType, String key, Object value) async =>
      false;
}

class _ControlledStore extends InMemorySharedPreferencesStore {
  _ControlledStore(super.data) : super.withData();
  Future<void> Function()? beforeRead;
  Future<void> Function()? beforeWrite;
  @override
  Future<Map<String, Object>> getAll() async {
    await beforeRead?.call();
    return await super.getAll();
  }

  bool failClear = false;
  bool throwClear = false;
  bool failSelected = false;
  Completer<bool>? delayedClear;
  @override
  Future<bool> setValue(String type, String key, Object value) async {
    await beforeWrite?.call();
    if (value == 'clear:v1') {
      if (throwClear) throw StateError('Synthetic failed host write');
      if (failClear) return false;
      final wait = delayedClear;
      if (wait != null && !await wait.future) return false;
    }
    if (failSelected && key.contains('mira-dashboard-chat-')) return false;
    return await super.setValue(type, key, value);
  }
}

class _ResetPreferenceStore extends InMemorySharedPreferencesStore {
  _ResetPreferenceStore(super.data) : super.withData();
  final started = Completer<void>();
  Completer<void>? held;
  bool throws = false;
  bool unreadable = false;
  @override
  Future<Map<String, Object>> getAll() async {
    if (unreadable) throw StateError('Synthetic host read unavailable');
    return await super.getAll();
  }

  Future<bool> reject() async {
    if (!started.isCompleted) started.complete();
    if (held != null) await held!.future;
    if (throws) throw StateError('Synthetic host rejection');
    return false;
  }

  @override
  Future<bool> remove(String key) => reject();
  @override
  Future<bool> setValue(String type, String key, Object value) => reject();
}

const ws = '11111111-1111-4111-8111-111111111111';
const chat = '22222222-2222-4222-8222-222222222222';
void main() {
  late _Api api;
  late _Chats chats;
  late AssistantRepository repository;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    api = _Api();
    chats = _Chats();
    repository = AssistantRepository(
      apiClient: api,
      tasksApiClient: api,
      chatRepository: chats,
      currentUserId: () => '33333333-3333-4333-8333-333333333333',
    );
    await repository.acknowledgeUnknownChatCreation(ws);
  });
  test('failed marker write denies creation before HTTP and informed '
      'acknowledgment', () async {
    SharedPreferences.resetStatic();
    SharedPreferencesStorePlatform.instance = _FailedPreferenceWrite({
      'flutter.33333333-3333-4333-8333-333333333333::mira-chat-creation::$ws':
          'clear:v1',
    });
    await expectLater(
      repository.createChat(
        id: chat,
        wsId: ws,
        modelId: 'synthetic/model',
        message: 'Synthetic prompt',
        timezone: 'UTC',
      ),
      throwsA(isA<AssistantCreationUncertainException>()),
    );
    verifyNever(
      () => chats.createAcknowledgedConversation(
        any(),
        title: any(named: 'title'),
        modelId: any(named: 'modelId'),
      ),
    );
    await expectLater(
      repository.acknowledgeUnknownChatCreation(ws),
      throwsA(isA<AssistantCreationUncertainException>()),
    );
    SharedPreferences.resetStatic();
  });
  for (final failure in ['false', 'throw', 'selected', 'post-ack']) {
    test(
      'failed $failure transition holds subsequent operations and host restart',
      () async {
        var actor = '33333333-3333-4333-8333-333333333333';
        final key = 'flutter.$actor::mira-chat-creation::$ws';
        final store = _ControlledStore({
          key: failure == 'selected' || failure == 'post-ack'
              ? 'clear:v1'
              : 'unknown:v1',
        });
        SharedPreferences.resetStatic();
        SharedPreferencesStorePlatform.instance = store;
        store
          ..failClear = failure == 'false' || failure == 'post-ack'
          ..throwClear = failure == 'throw'
          ..failSelected = failure == 'selected';
        var calls = 0;
        when(() => api.postJson(any(), any())).thenAnswer((_) async {
          calls++;
          return {
            'conversation': {
              'id': chat,
              'wsId': ws,
              'type': 'ai',
              'createdAt': '2026-10-12T00:00:00Z',
            },
          };
        });
        AssistantRepository fresh() => AssistantRepository(
          apiClient: api,
          tasksApiClient: api,
          chatRepository: ChatRepository(apiClient: api),
          currentUserId: () => actor,
        );
        Future<AssistantChatRecord> create() => fresh().createChat(
          id: chat,
          wsId: ws,
          modelId: 'synthetic/model',
          message: 'Synthetic',
          timezone: 'UTC',
        );
        await expectLater(
          failure == 'selected' || failure == 'post-ack'
              ? create()
              : fresh().acknowledgeUnknownChatCreation(ws),
          throwsA(isA<Object>()),
        );
        final acceptedCalls = calls;
        store
          ..failClear = false
          ..throwClear = false
          ..failSelected = false;
        expect(await fresh().hasUnknownChatCreation(ws), isTrue);
        expect(await fresh().hasUnknownChatCreation(chat), isTrue);
        actor = '44444444-4444-4444-8444-444444444444';
        expect(await fresh().hasUnknownChatCreation(ws), isTrue);
        actor = '33333333-3333-4333-8333-333333333333';
        SharedPreferences.resetStatic(); // Keep the actual backing store.
        expect(await fresh().hasUnknownChatCreation(ws), isTrue);
        await expectLater(
          create(),
          throwsA(isA<AssistantCreationUncertainException>()),
        );
        expect(calls, acceptedCalls);
        await fresh().acknowledgeUnknownChatCreation(ws);
        expect(await fresh().hasUnknownChatCreation(ws), isFalse);
      },
    );
  }
  test(
    'pending clear serializes overlapping reads and create until accepted',
    () async {
      const actor = '33333333-3333-4333-8333-333333333333';
      final store = _ControlledStore({
        'flutter.$actor::mira-chat-creation::$ws': 'unknown:v1',
      });
      SharedPreferences.resetStatic();
      SharedPreferencesStorePlatform.instance = store;
      store.delayedClear = Completer<bool>();
      final clear = repository.acknowledgeUnknownChatCreation(ws);
      await Future<void>.delayed(Duration.zero);
      var settled = false;
      final read = repository.hasUnknownChatCreation(ws).then((value) {
        settled = true;
        return value;
      });
      final create = repository.createChat(
        id: chat,
        wsId: ws,
        modelId: 'synthetic/model',
        message: 'Synthetic',
        timezone: 'UTC',
      );
      await Future<void>.delayed(Duration.zero);
      expect(settled, isFalse);
      verifyNever(
        () => chats.createAcknowledgedConversation(
          any(),
          title: any(named: 'title'),
          modelId: any(named: 'modelId'),
        ),
      );
      store.delayedClear!.complete(false);
      await expectLater(
        clear,
        throwsA(isA<AssistantCreationUncertainException>()),
      );
      expect(await read, isTrue);
      await expectLater(
        create,
        throwsA(isA<AssistantCreationUncertainException>()),
      );
    },
  );
  test(
    'missing creation marker fails closed and is isolated by actor/workspace',
    () async {
      SharedPreferences.setMockInitialValues({});
      var actor = '33333333-3333-4333-8333-333333333333';
      final scoped = AssistantRepository(
        apiClient: api,
        tasksApiClient: api,
        currentUserId: () => actor,
      );
      expect(await scoped.hasUnknownChatCreation(ws), isTrue);
      await scoped.acknowledgeUnknownChatCreation(ws);
      expect(await scoped.hasUnknownChatCreation(ws), isFalse);
      expect(await scoped.hasUnknownChatCreation(chat), isTrue);
      actor = '44444444-4444-4444-8444-444444444444';
      expect(await scoped.hasUnknownChatCreation(ws), isTrue);
      actor = '33333333-3333-4333-8333-333333333333';
      expect(await scoped.hasUnknownChatCreation(ws), isFalse);
    },
  );
  test(
    'unknown creation is persisted before HTTP and survives repository restart',
    () async {
      when(
        () => api.postJson('/api/v1/workspaces/$ws/chat/conversations', any()),
      ).thenThrow(const ApiException.transport(message: 'Synthetic timeout'));
      AssistantRepository fresh() => AssistantRepository(
        apiClient: api,
        tasksApiClient: api,
        chatRepository: ChatRepository(apiClient: api),
        currentUserId: () => '33333333-3333-4333-8333-333333333333',
      );
      await expectLater(
        fresh().createChat(
          id: chat,
          wsId: ws,
          modelId: 'synthetic/model',
          message: 'Synthetic prompt',
          timezone: 'UTC',
        ),
        throwsA(isA<ApiException>()),
      );
      expect(await fresh().hasUnknownChatCreation(ws), isTrue);
      await expectLater(
        fresh().createChat(
          id: chat,
          wsId: ws,
          modelId: 'synthetic/model',
          message: 'Synthetic prompt',
          timezone: 'UTC',
        ),
        throwsA(isA<AssistantCreationUncertainException>()),
      );
      verify(
        () => api.postJson('/api/v1/workspaces/$ws/chat/conversations', any()),
      ).called(1);
    },
  );
  test(
    'only a definitive pre-effect code releases a failed creation marker',
    () async {
      final direct = AssistantRepository(
        apiClient: api,
        tasksApiClient: api,
        chatRepository: ChatRepository(apiClient: api),
        currentUserId: () => '33333333-3333-4333-8333-333333333333',
      );
      when(() => api.postJson(any(), any())).thenThrow(
        const ApiException(
          message: 'Synthetic validation',
          statusCode: 400,
          code: 'chat_create_invalid_request',
        ),
      );
      await expectLater(
        direct.createChat(
          id: chat,
          wsId: ws,
          modelId: 'synthetic/model',
          message: 'Synthetic',
          timezone: 'UTC',
        ),
        throwsA(isA<ApiException>()),
      );
      expect(await direct.hasUnknownChatCreation(ws), isFalse);
      when(() => api.postJson(any(), any())).thenThrow(
        const ApiException(message: 'Unknown rate limit', statusCode: 429),
      );
      await expectLater(
        direct.createChat(
          id: chat,
          wsId: ws,
          modelId: 'synthetic/model',
          message: 'Synthetic',
          timezone: 'UTC',
        ),
        throwsA(isA<ApiException>()),
      );
      expect(await direct.hasUnknownChatCreation(ws), isTrue);
    },
  );
  for (final phase in ['read', 'clear']) {
    test(
      'actor transition during $phase retains scope hold after return',
      () async {
        var actor = '33333333-3333-4333-8333-333333333333';
        final store = _ControlledStore({
          'flutter.$actor::mira-chat-creation::$ws': 'unknown:v1',
        });
        SharedPreferences.resetStatic();
        SharedPreferencesStorePlatform.instance = store;
        final scoped = AssistantRepository(
          apiClient: api,
          tasksApiClient: api,
          chatRepository: chats,
          currentUserId: () => actor,
        );
        Future<void> change() async {
          actor = '44444444-4444-4444-8444-444444444444';
        }

        if (phase == 'read') {
          store.beforeRead = change;
        } else {
          store.beforeWrite = change;
        }
        await expectLater(
          phase == 'read'
              ? scoped.hasUnknownChatCreation(ws)
              : scoped.acknowledgeUnknownChatCreation(ws),
          throwsA(isA<AssistantCreationUncertainException>()),
        );
        store
          ..beforeRead = null
          ..beforeWrite = null;
        actor = '33333333-3333-4333-8333-333333333333';
        expect(await scoped.hasUnknownChatCreation(ws), isTrue);
        verifyNever(() => api.postJson(any(), any()));
      },
    );
  }
  test(
    'accepted delayed clear admits one create only after host confirmation',
    () async {
      const actor = '33333333-3333-4333-8333-333333333333';
      final store = _ControlledStore({
        'flutter.$actor::mira-chat-creation::$ws': 'unknown:v1',
      });
      SharedPreferences.resetStatic();
      SharedPreferencesStorePlatform.instance = store;
      store.delayedClear = Completer<bool>();
      var calls = 0;
      when(() => api.postJson(any(), any())).thenAnswer((_) async {
        calls++;
        return {
          'conversation': {
            'id': chat,
            'wsId': ws,
            'type': 'ai',
            'createdAt': '2026-10-12T00:00:00Z',
          },
        };
      });
      final direct = AssistantRepository(
        apiClient: api,
        tasksApiClient: api,
        chatRepository: ChatRepository(apiClient: api),
        currentUserId: () => actor,
      );
      final clear = direct.acknowledgeUnknownChatCreation(ws);
      await Future<void>.delayed(Duration.zero);
      final create = direct.createChat(
        id: chat,
        wsId: ws,
        modelId: 'synthetic/model',
        message: 'Synthetic',
        timezone: 'UTC',
      );
      await Future<void>.delayed(Duration.zero);
      expect(calls, 0);
      store.delayedClear!.complete(true);
      await clear;
      expect((await create).id, chat);
      expect(calls, 1);
    },
  );
  for (final removal in [true, false]) {
    for (final failure in ['false', 'throw', 'held']) {
      test(
        'reset $failure preserves same-singleton host value ($removal)',
        () async {
          final store = _ResetPreferenceStore({
            'flutter.actor::mira-dashboard-chat-$ws': chat,
            'flutter.actor::mira-dashboard-workspace-context-$ws': 'prior',
          })..throws = failure == 'throw';
          if (failure == 'held') {
            store.held = Completer<void>();
            addTearDown(() {
              if (!store.held!.isCompleted) store.held!.complete();
            });
          }
          SharedPreferences.resetStatic();
          SharedPreferencesStorePlatform.instance = store;
          final preferences = AssistantPreferences(
            currentUserId: () => 'actor',
          );
          final write = removal
              ? preferences.clearChatIdAcknowledged(
                  ws,
                  actorId: 'actor',
                  isCurrent: () => true,
                )
              : preferences.saveWorkspaceContextIdAcknowledged(
                  ws,
                  'personal',
                  actorId: 'actor',
                  isCurrent: () => true,
                );
          final safeWrite = write.catchError((Object _) => false);
          await store.started.future;
          final read = removal
              ? preferences.loadChatId(ws)
              : preferences.loadWorkspaceContextId(ws);
          String? observed;
          var settled = false;
          unawaited(
            read.then((value) {
              observed = value;
              settled = true;
            }),
          );
          if (failure == 'held') {
            await Future<void>.delayed(Duration.zero);
            expect(settled, false);
            store.held!.complete();
          }
          expect(await safeWrite, false);
          await read;
          expect(observed, removal ? chat : 'prior');
          SharedPreferences.resetStatic();
          expect(
            await (removal
                ? preferences.loadChatId(ws)
                : preferences.loadWorkspaceContextId(ws)),
            removal ? chat : 'prior',
          );
        },
      );
    }
  }
  test(
    'invalid raw creation title settles unknown without consuming composer',
    () async {
      when(() => api.postJson(any(), any())).thenAnswer(
        (_) async => {
          'conversation': {
            'id': chat,
            'wsId': ws,
            'type': 'ai',
            'createdAt': '2026-10-12T00:00:00Z',
            'title': 42,
          },
        },
      );
      final actual = AssistantRepository(
        apiClient: api,
        tasksApiClient: api,
        chatRepository: ChatRepository(apiClient: api),
        currentUserId: () => '33333333-3333-4333-8333-333333333333',
      );
      final cubit = AssistantChatCubit(
        repository: actual,
        preferences: AssistantPreferences(
          currentUserId: () => actual.currentActorId,
        ),
        onWorkspaceContextChanged: (_) async {},
        onSoulRefreshRequested: () async {},
        onImmersiveModeChanged: (_) {},
        onChatRestored: (_) async {},
      );
      addTearDown(cubit.close);
      // Seed the isolated empty workspace; execute real direct creation/decoding.
      const attachment = AssistantAttachment(
        id: 'synthetic-file',
        name: 'fixture',
        size: 1,
        type: 'text/plain',
        storagePath: 'synthetic/file',
        uploadState: AssistantAttachmentUploadState.uploaded,
      );
      cubit.emit(
        cubit.state.copyWith(
          workspaceId: ws,
          composerAttachments: const [attachment],
        ),
      );
      final pending = cubit.submitAcknowledged(
        wsId: ws,
        message: 'Synthetic draft',
        modelId: 'synthetic/model',
        thinkingMode: AssistantThinkingMode.thinking,
        creditSource: AssistantCreditSource.workspace,
        workspaceContextId: ws,
        timezone: 'UTC',
      );
      AssistantSubmissionOutcome? result;
      unawaited(pending.then((value) => result = value));
      await Future<void>.delayed(const Duration(milliseconds: 300));
      expect(result?.disposition, AssistantSubmissionDisposition.unknown);
      expect(cubit.state.creationOutcomeUnknown, true);
      expect(cubit.state.composerAttachments, const [attachment]);
      expect(cubit.state.messages.single.parts.single.text, 'Synthetic draft');
      expect(await actual.hasUnknownChatCreation(ws), true);
      verify(() => api.postJson(any(), any())).called(1);
    },
  );
  test(
    'reset cache recovery failure remains unreadable across same-instance read',
    () async {
      final store = _ResetPreferenceStore({
        'flutter.actor::mira-dashboard-chat-$ws': chat,
      });
      SharedPreferences.resetStatic();
      SharedPreferencesStorePlatform.instance = store;
      final preferences = AssistantPreferences(currentUserId: () => 'actor');
      expect(await preferences.loadChatId(ws), chat);
      store.unreadable = true;
      await expectLater(
        preferences.clearChatIdAcknowledged(
          ws,
          actorId: 'actor',
          isCurrent: () => true,
        ),
        throwsStateError,
      );
      await expectLater(preferences.loadChatId(ws), throwsFormatException);
      store.unreadable = false;
      expect(await preferences.loadChatId(ws), chat);
    },
  );
}
