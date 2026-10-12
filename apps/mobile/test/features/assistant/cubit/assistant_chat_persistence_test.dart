import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
// The installed plugin interface supplies a synthetic host store for bool ACKs.
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';

class _Repository extends Mock implements AssistantRepository {}

class _Preferences extends Mock implements AssistantPreferences {}

class _ResetStore extends InMemorySharedPreferencesStore {
  _ResetStore(super.data) : super.withData();
  bool removeFails = false;
  bool contextFails = false;
  Future<void> Function()? beforeWrite;
  @override
  Future<bool> remove(String key) async {
    await beforeWrite?.call();
    return !removeFails && await super.remove(key);
  }

  @override
  Future<bool> setValue(String type, String key, Object value) async {
    await beforeWrite?.call();
    return !contextFails && await super.setValue(type, key, value);
  }
}

void main() {
  setUpAll(() {
    registerFallbackValue(AssistantThinkingMode.thinking);
    registerFallbackValue(AssistantCreditSource.workspace);
    registerFallbackValue(<AssistantMessage>[]);
    registerFallbackValue(<AssistantAttachment>[]);
  });
  late _Repository repository;
  late _Preferences preferences;
  late AssistantChatCubit cubit;
  setUp(() {
    repository = _Repository();
    preferences = _Preferences();
    when(() => repository.currentActorId).thenReturn('actor');
    when(() => preferences.matchesResetActor('actor')).thenReturn(true);
    when(
      () => preferences.clearChatIdAcknowledged(
        any(),
        actorId: any(named: 'actorId'),
        isCurrent: any(named: 'isCurrent'),
      ),
    ).thenAnswer((_) async => true);
    when(
      () => preferences.saveWorkspaceContextIdAcknowledged(
        any(),
        any(),
        actorId: any(named: 'actorId'),
        isCurrent: any(named: 'isCurrent'),
      ),
    ).thenAnswer((_) async => true);
    when(
      repository.generateUuid,
    ).thenReturn('11111111-1111-4111-8111-111111111111');
    when(
      () => repository.hasUnknownChatCreation(any()),
    ).thenAnswer((_) async => false);
    when(
      () => preferences.loadChatId(any()),
    ).thenAnswer((_) async => 'selected');
    when(
      () => repository.fetchRecentChats(wsId: any(named: 'wsId')),
    ).thenAnswer((_) async => []);
    when(
      () => repository.restoreChat(
        wsId: any(named: 'wsId'),
        chatId: any(named: 'chatId'),
        cacheOrigin: any(named: 'cacheOrigin'),
      ),
    ).thenThrow(
      const ApiException(message: 'Synthetic failure', statusCode: 503),
    );
    cubit = AssistantChatCubit(
      repository: repository,
      preferences: preferences,
      onResetWorkspaceContext: (_, current) async => current(),
      onWorkspaceContextChanged: (_) async {},
      onSoulRefreshRequested: () async {},
      onImmersiveModeChanged: (_) {},
      onChatRestored: (_) async {},
    );
    addTearDown(cubit.close);
  });
  Future<void> submit() => cubit.submit(
    wsId: 'ws',
    message: 'Synthetic prompt',
    modelId: 'synthetic/model',
    thinkingMode: AssistantThinkingMode.thinking,
    creditSource: AssistantCreditSource.workspace,
    workspaceContextId: 'ws',
    timezone: 'UTC',
  );
  for (final status in [401, 403, 429, 500, 503]) {
    test(
      'cold restore $status preserves selection and cannot create replacement',
      () async {
        when(
          () => repository.restoreChat(
            wsId: 'ws',
            chatId: 'selected',
            cacheOrigin: any(named: 'cacheOrigin'),
          ),
        ).thenThrow(
          ApiException(message: 'Synthetic failure', statusCode: status),
        );
        await cubit.loadWorkspace('ws');
        await submit();
        expect(cubit.state.status, AssistantChatStatus.error);
        expect(cubit.state.storedChatId, 'selected');
        expect(cubit.state.queuedMessages, isEmpty);
        verifyNever(
          () => repository.createChat(
            id: any(named: 'id'),
            wsId: any(named: 'wsId'),
            modelId: any(named: 'modelId'),
            message: any(named: 'message'),
            timezone: any(named: 'timezone'),
          ),
        );
        verifyNever(
          () => preferences.clearChatId(
            any(),
            shouldWrite: any(named: 'shouldWrite'),
          ),
        );
      },
    );
  }
  for (final failure in [
    const ApiException.transport(message: 'Synthetic unknown'),
    const ApiException(message: 'Synthetic accepted timeout', statusCode: 408),
    const ApiException(
      message: 'Synthetic gateway cancellation',
      statusCode: 499,
    ),
    const ApiException(message: 'Synthetic unavailable', statusCode: 503),
    const FormatException('Synthetic malformed receipt'),
  ]) {
    test('uncertain creation ${failure.runtimeType}/$failure blocks repeated '
        'create', () async {
      when(() => preferences.loadChatId(any())).thenAnswer((_) async => null);
      when(
        () => repository.createChat(
          id: any(named: 'id'),
          wsId: any(named: 'wsId'),
          modelId: any(named: 'modelId'),
          message: any(named: 'message'),
          timezone: any(named: 'timezone'),
        ),
      ).thenThrow(failure);
      await cubit.loadWorkspace('ws');
      await submit();
      await cubit.stream
          .firstWhere((state) => state.status == AssistantChatStatus.error)
          .timeout(const Duration(seconds: 2));
      expect(cubit.state.creationOutcomeUnknown, isTrue);
      await submit();
      verify(
        () => repository.createChat(
          id: any(named: 'id'),
          wsId: any(named: 'wsId'),
          modelId: any(named: 'modelId'),
          message: any(named: 'message'),
          timezone: any(named: 'timezone'),
        ),
      ).called(1);
      final fallback = cubit.state.fallbackChatId;
      expect(await cubit.resetConversation('ws'), isFalse);
      expect(cubit.state.fallbackChatId, fallback);
    });
  }
  test('missing marker read fails closed but keeps verified history', () async {
    when(
      () => repository.hasUnknownChatCreation(any()),
    ).thenThrow(StateError('Synthetic unreadable'));
    when(
      () => repository.restoreChat(
        wsId: 'ws',
        chatId: 'selected',
        cacheOrigin: any(named: 'cacheOrigin'),
      ),
    ).thenAnswer(
      (_) async => const AssistantRestoredChat(
        chat: AssistantChatRecord(id: 'selected'),
        messages: [],
        attachmentsByMessageId: {},
      ),
    );
    await cubit.loadWorkspace('ws');
    expect(cubit.state.creationOutcomeUnknown, isTrue);
    expect(cubit.state.chat?.id, 'selected');
    expect(await cubit.resetConversation('ws'), isFalse);
    expect(cubit.state.chat?.id, 'selected');
  });
  test(
    'marker write failure throws without resetting selected history',
    () async {
      await cubit.loadWorkspace('ws');
      final before = cubit.state;
      when(
        () => repository.hasUnknownChatCreation('ws'),
      ).thenAnswer((_) async => true);
      when(() => repository.acknowledgeUnknownChatCreation('ws')).thenThrow(
        const AssistantCreationUncertainException('Synthetic write failure'),
      );
      await expectLater(
        cubit.resetConversation('ws', acknowledgeUnknownCreation: true),
        throwsA(isA<AssistantCreationUncertainException>()),
      );
      expect(cubit.state, before);
      verifyNever(
        () => preferences.clearChatId(
          any(),
          shouldWrite: any(named: 'shouldWrite'),
        ),
      );
    },
  );
  test('informed reset succeeds only after marker acknowledgment', () async {
    await cubit.loadWorkspace('ws');
    when(
      () => repository.hasUnknownChatCreation('ws'),
    ).thenAnswer((_) async => true);
    when(
      () => repository.acknowledgeUnknownChatCreation('ws'),
    ).thenAnswer((_) async {});
    when(
      () =>
          preferences.clearChatId('ws', shouldWrite: any(named: 'shouldWrite')),
    ).thenAnswer((_) async {});
    when(
      () => preferences.saveWorkspaceContextId(
        'ws',
        'personal',
        shouldWrite: any(named: 'shouldWrite'),
      ),
    ).thenAnswer((_) async {});
    expect(
      await cubit.resetConversation('ws', acknowledgeUnknownCreation: true),
      isTrue,
    );
    expect(cubit.state.creationOutcomeUnknown, isFalse);
    expect(cubit.state.storedChatId, isNull);
    verify(() => repository.acknowledgeUnknownChatCreation('ws')).called(1);
  });
  test(
    'stale workspace reset returns false without acknowledging a marker',
    () async {
      await cubit.loadWorkspace('ws');
      final before = cubit.state;
      expect(
        await cubit.resetConversation(
          'other',
          acknowledgeUnknownCreation: true,
        ),
        isFalse,
      );
      expect(cubit.state, before);
      verifyNever(() => repository.acknowledgeUnknownChatCreation(any()));
    },
  );
  test(
    'late marker load cannot replace current workspace settlement',
    () async {
      final oldMarker = Completer<bool>();
      when(
        () => repository.hasUnknownChatCreation('ws'),
      ).thenAnswer((_) => oldMarker.future);
      when(() => preferences.loadChatId('other')).thenAnswer((_) async => null);
      final oldLoad = cubit.loadWorkspace('ws');
      await Future<void>.delayed(Duration.zero);
      await cubit.loadWorkspace('other');
      oldMarker.complete(true);
      await oldLoad;
      expect(cubit.state.workspaceId, 'other');
      expect(cubit.state.creationOutcomeUnknown, isFalse);
      expect(cubit.state.status, AssistantChatStatus.idle);
      verifyNever(() => preferences.loadChatId('ws'));
    },
  );
  for (final unknown in [true, false]) {
    test(
      'denied retry retains saved history and attachments ($unknown)',
      () async {
        const attachment = AssistantAttachment(
          id: 'file',
          name: 'fixture',
          size: 1,
          type: 'text/plain',
          storagePath: 'synthetic/file',
          uploadState: AssistantAttachmentUploadState.uploaded,
        );
        when(
          () => repository.hasUnknownChatCreation('ws'),
        ).thenAnswer((_) async => unknown);
        when(
          () => repository.restoreChat(
            wsId: 'ws',
            chatId: 'selected',
            cacheOrigin: any(named: 'cacheOrigin'),
          ),
        ).thenAnswer(
          (_) async => AssistantRestoredChat(
            chat: const AssistantChatRecord(id: 'selected'),
            messages: [
              AssistantMessage(
                id: 'user',
                role: 'user',
                clientRequestId: unknown
                    ? '11111111-1111-4111-8111-111111111111'
                    : null,
                parts: const [
                  AssistantMessagePart(type: 'text', text: 'Synthetic'),
                ],
              ),
              const AssistantMessage(
                id: 'saved-reply',
                role: 'assistant',
                parts: [
                  AssistantMessagePart(type: 'text', text: 'Saved fixture'),
                ],
              ),
            ],
            attachmentsByMessageId: const {
              'user': [attachment],
            },
          ),
        );
        await cubit.loadWorkspace('ws');
        final before = cubit.state;
        await cubit.retryLast(
          wsId: 'ws',
          modelId: 'synthetic/model',
          thinkingMode: AssistantThinkingMode.thinking,
          creditSource: AssistantCreditSource.workspace,
          workspaceContextId: 'ws',
          timezone: 'UTC',
        );
        expect(cubit.state.messages, before.messages);
        expect(
          cubit.state.attachmentsByMessageId,
          before.attachmentsByMessageId,
        );
        expect(cubit.state.error, isNotEmpty);
        verifyNever(
          () => repository.streamChat(
            chatId: any(named: 'chatId'),
            wsId: any(named: 'wsId'),
            workspaceContextId: any(named: 'workspaceContextId'),
            modelId: any(named: 'modelId'),
            messages: any(named: 'messages'),
            thinkingMode: any(named: 'thinkingMode'),
            creditSource: any(named: 'creditSource'),
            timezone: any(named: 'timezone'),
            attachments: any(named: 'attachments'),
            creditWsId: any(named: 'creditWsId'),
          ),
        );
      },
    );
  }
  for (final failRemoval in [true, false]) {
    test(
      'real reset preferences acknowledge false removal/context independently '
      '($failRemoval)',
      () async {
        final store = _ResetStore({
          'flutter.actor::mira-dashboard-chat-ws': 'selected',
          'flutter.actor::mira-dashboard-workspace-context-ws': 'prior',
        });
        SharedPreferences.resetStatic();
        SharedPreferencesStorePlatform.instance = store;
        store
          ..removeFails = failRemoval
          ..contextFails = !failRemoval;
        final real = AssistantPreferences(currentUserId: () => 'actor');
        final result = failRemoval
            ? await real.clearChatIdAcknowledged(
                'ws',
                actorId: 'actor',
                isCurrent: () => true,
              )
            : await real.saveWorkspaceContextIdAcknowledged(
                'ws',
                'personal',
                actorId: 'actor',
                isCurrent: () => true,
              );
        expect(result, isFalse);
        expect(await real.loadChatId('ws'), 'selected');
        expect(await real.loadWorkspaceContextId('ws'), 'prior');
        SharedPreferences.resetStatic();
        expect(await real.loadChatId('ws'), 'selected');
        expect(await real.loadWorkspaceContextId('ws'), 'prior');
      },
    );
  }
  test(
    'strict preference write does not transfer consent after actor change',
    () async {
      var actor = 'actor';
      final store = _ResetStore({
        'flutter.actor::mira-dashboard-chat-ws': 'selected',
      });
      SharedPreferences.resetStatic();
      SharedPreferencesStorePlatform.instance = store;
      final real = AssistantPreferences(currentUserId: () => actor);
      store.beforeWrite = () async {
        actor = 'other';
      };
      expect(
        await real.clearChatIdAcknowledged(
          'ws',
          actorId: 'actor',
          isCurrent: () => true,
        ),
        isFalse,
      );
      expect(
        await real.clearChatIdAcknowledged(
          'ws',
          actorId: 'actor',
          isCurrent: () => true,
        ),
        isFalse,
      );
    },
  );
  test(
    'guarded shell callback does not emit after stale context persistence',
    () async {
      final pending = Completer<bool>();
      when(
        () => preferences.saveWorkspaceContextIdAcknowledged(
          'ws',
          'personal',
          actorId: 'actor',
          isCurrent: any(named: 'isCurrent'),
        ),
      ).thenAnswer((_) => pending.future);
      final shell = AssistantShellCubit(
        repository: repository,
        preferences: preferences,
      );
      addTearDown(shell.close);
      // Seed only the synthetic selection; execute the real guarded callback.
      shell.emit(
        const AssistantShellState(
          workspace: Workspace(id: 'ws'),
          workspaceContextId: 'prior',
        ),
      );
      var current = true;
      final reset = shell.resetWorkspaceContextAcknowledged(
        'personal',
        () => current,
      );
      await Future<void>.delayed(Duration.zero);
      current = false;
      pending.complete(true);
      expect(await reset, isFalse);
      expect(shell.state.workspaceContextId, 'prior');
    },
  );
  test(
    'held guarded callback cannot invoke stale restore or report true',
    () async {
      await cubit.close();
      final held = Completer<bool>();
      var restores = 0;
      cubit = AssistantChatCubit(
        repository: repository,
        preferences: preferences,
        onWorkspaceContextChanged: (_) async {},
        onResetWorkspaceContext: (_, _) => held.future,
        onSoulRefreshRequested: () async {},
        onImmersiveModeChanged: (_) {},
        onChatRestored: (_) async {
          restores++;
        },
      );
      addTearDown(cubit.close);
      await cubit.loadWorkspace('ws');
      final before = restores;
      final reset = cubit.resetConversation('ws');
      await Future<void>.delayed(Duration.zero);
      when(() => preferences.loadChatId('other')).thenAnswer((_) async => null);
      await cubit.loadWorkspace('other');
      final currentRestores = restores;
      held.complete(true);
      expect(await reset, isFalse);
      expect(restores, currentRestores);
      expect(currentRestores, greaterThanOrEqualTo(before));
    },
  );
  test(
    'missing guarded adapter refuses reset without changing history',
    () async {
      await cubit.close();
      cubit = AssistantChatCubit(
        repository: repository,
        preferences: preferences,
        onWorkspaceContextChanged: (_) async {},
        onSoulRefreshRequested: () async {},
        onImmersiveModeChanged: (_) {},
        onChatRestored: (_) async {},
      );
      addTearDown(cubit.close);
      await cubit.loadWorkspace('ws');
      final before = cubit.state;
      expect(
        await cubit.resetConversation('ws', acknowledgeUnknownCreation: true),
        isFalse,
      );
      expect(cubit.state, before);
      verifyNever(() => repository.acknowledgeUnknownChatCreation(any()));
    },
  );
  test('failed selected removal cannot report a complete reset', () async {
    await cubit.loadWorkspace('ws');
    final before = cubit.state;
    when(
      () => preferences.clearChatIdAcknowledged(
        'ws',
        actorId: 'actor',
        isCurrent: any(named: 'isCurrent'),
      ),
    ).thenAnswer((_) async => false);
    expect(await cubit.resetConversation('ws'), isFalse);
    expect(cubit.state, before);
  });
  test(
    'guarded shell callback retains context on false durable acknowledgment',
    () async {
      when(
        () => preferences.saveWorkspaceContextIdAcknowledged(
          'ws',
          'personal',
          actorId: 'actor',
          isCurrent: any(named: 'isCurrent'),
        ),
      ).thenAnswer((_) async => false);
      final shell = AssistantShellCubit(
        repository: repository,
        preferences: preferences,
      );
      addTearDown(shell.close);
      shell.emit(
        const AssistantShellState(
          workspace: Workspace(id: 'ws'),
          workspaceContextId: 'prior',
        ),
      );
      expect(
        await shell.resetWorkspaceContextAcknowledged('personal', () => true),
        isFalse,
      );
      expect(shell.state.workspaceContextId, 'prior');
    },
  );
  test('failed guarded context leaves selected preference untouched', () async {
    await cubit.close();
    cubit = AssistantChatCubit(
      repository: repository,
      preferences: preferences,
      onWorkspaceContextChanged: (_) async {},
      onResetWorkspaceContext: (_, _) async => false,
      onSoulRefreshRequested: () async {},
      onImmersiveModeChanged: (_) {},
      onChatRestored: (_) async {},
    );
    addTearDown(cubit.close);
    await cubit.loadWorkspace('ws');
    final before = cubit.state;
    expect(await cubit.resetConversation('ws'), isFalse);
    expect(cubit.state, before);
    verifyNever(
      () => preferences.clearChatIdAcknowledged(
        any(),
        actorId: any(named: 'actorId'),
        isCurrent: any(named: 'isCurrent'),
      ),
    );
  });
}
