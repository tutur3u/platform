import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_memory_file.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements AssistantRepository {}

class _Preferences extends Mock implements AssistantPreferences {}

void main() {
  late _Repository repository;
  late _Preferences preferences;
  late AssistantChatCubit cubit;
  const restored = AssistantRestoredChat(
    chat: AssistantChatRecord(id: 'cached'),
    messages: [],
    attachmentsByMessageId: {},
  );

  setUpAll(() {
    registerFallbackValue(restored);
    registerFallbackValue(
      AssistantFilePickerResult(
        id: 'fallback',
        file: AssistantMemoryFile(name: 'voice.m4a', bytes: Uint8List(0)),
        name: 'voice.m4a',
        size: 0,
        path: '',
        mimeType: 'audio/m4a',
      ),
    );
  });

  setUp(() {
    repository = _Repository();
    preferences = _Preferences();
    when(repository.generateUuid).thenReturn('new-chat');
    when(() => preferences.loadChatId(any())).thenAnswer((_) async => 'cached');
    when(
      () => preferences.saveChatId(
        any(),
        any(),
        shouldWrite: any(named: 'shouldWrite'),
      ),
    ).thenAnswer((_) async {});
    when(
      () => preferences.clearChatId(
        any(),
        shouldWrite: any(named: 'shouldWrite'),
      ),
    ).thenAnswer((_) async {});
    when(
      () => preferences.saveWorkspaceContextId(
        any(),
        any(),
        shouldWrite: any(named: 'shouldWrite'),
      ),
    ).thenAnswer((_) async {});
    when(
      () => repository.restoreChat(
        wsId: any(named: 'wsId'),
        chatId: any(named: 'chatId'),
      ),
    ).thenAnswer((_) async => restored);
    when(
      () => repository.fetchRecentChats(wsId: any(named: 'wsId')),
    ).thenAnswer((_) async => []);
    cubit = AssistantChatCubit(
      repository: repository,
      preferences: preferences,
      onWorkspaceContextChanged: (_) async {},
      onSoulRefreshRequested: () async {},
      onImmersiveModeChanged: (_) {},
      onChatRestored: (_) async {},
    );
    addTearDown(cubit.close);
  });

  test(
    'voice attachment creates its chat before uploading and keeps its type',
    () async {
      when(() => preferences.loadChatId('ws')).thenAnswer((_) async => null);
      await cubit.loadWorkspace('ws');
      when(
        () => repository.createChat(
          id: any(named: 'id'),
          wsId: 'ws',
          modelId: 'model',
          message: 'New chat',
          timezone: 'UTC',
        ),
      ).thenAnswer((_) async => const AssistantChatRecord(id: 'persisted'));
      when(
        () => repository.uploadAttachment(
          wsId: 'ws',
          chatId: 'persisted',
          file: any(named: 'file'),
        ),
      ).thenAnswer((invocation) async {
        final file =
            invocation.namedArguments[#file] as AssistantFilePickerResult;
        expect(file.mimeType, 'audio/m4a');
        return const AssistantAttachment(
          id: 'audio',
          name: 'voice-message.m4a',
          size: 4,
          type: 'audio/m4a',
          storagePath: 'chats/persisted/audio.m4a',
          uploadState: AssistantAttachmentUploadState.uploaded,
        );
      });

      await cubit.addComposerAttachments(
        wsId: 'ws',
        files: [
          AssistantMemoryFile(
            name: 'voice-message.m4a',
            bytes: Uint8List.fromList([0, 1, 2, 3]),
          ),
        ],
        modelId: 'model',
        timezone: 'UTC',
      );

      expect(cubit.state.chat?.id, 'persisted');
      expect(cubit.state.composerAttachments.single.isUploaded, isTrue);
      when(
        () => repository.streamChat(
          chatId: 'persisted',
          wsId: 'ws',
          workspaceContextId: 'ws',
          modelId: 'model',
          messages: any(named: 'messages'),
          thinkingMode: AssistantThinkingMode.fast,
          creditSource: AssistantCreditSource.workspace,
          timezone: 'UTC',
          attachments: any(named: 'attachments'),
          creditWsId: 'ws',
        ),
      ).thenAnswer((_) => Stream.value(const AssistantDoneStreamEvent()));
      when(
        () => repository.writeAssistantChatCache(
          wsId: 'ws',
          chatId: 'persisted',
          restored: any(named: 'restored'),
        ),
      ).thenAnswer((_) async {});
      await cubit.submit(
        wsId: 'ws',
        message: 'What did I say?',
        modelId: 'model',
        thinkingMode: AssistantThinkingMode.fast,
        creditSource: AssistantCreditSource.workspace,
        workspaceContextId: 'ws',
        timezone: 'UTC',
        creditWsId: 'ws',
      );
      await Future<void>.delayed(const Duration(milliseconds: 300));
      final message = cubit.state.messages.single;
      expect(
        cubit.state.attachmentsByMessageId[message.id]?.single.id,
        'audio',
      );
      verify(
        () => repository.streamChat(
          chatId: 'persisted',
          wsId: 'ws',
          workspaceContextId: 'ws',
          modelId: 'model',
          messages: any(named: 'messages'),
          thinkingMode: AssistantThinkingMode.fast,
          creditSource: AssistantCreditSource.workspace,
          timezone: 'UTC',
          attachments: any(named: 'attachments'),
          creditWsId: 'ws',
        ),
      ).called(1);
      verify(
        () => repository.uploadAttachment(
          wsId: 'ws',
          chatId: 'persisted',
          file: any(named: 'file'),
        ),
      ).called(1);
    },
  );

  test(
    'Live history reload bypasses cache without hiding current messages',
    () async {
      await cubit.loadWorkspace('ws');
      final fresh = Completer<AssistantRestoredChat?>();
      when(
        () => repository.restoreChat(
          wsId: 'ws',
          chatId: 'cached',
          forceRefresh: true,
        ),
      ).thenAnswer((_) => fresh.future);
      final loading = cubit.openChatById('ws', 'cached');
      expect(cubit.state.status, AssistantChatStatus.idle);
      fresh.complete(
        const AssistantRestoredChat(
          chat: AssistantChatRecord(id: 'cached'),
          messages: [
            AssistantMessage(
              id: 'new-live-turn',
              role: 'assistant',
              parts: [AssistantMessagePart(type: 'text', text: 'Live saved')],
            ),
          ],
          attachmentsByMessageId: {},
        ),
      );
      await loading;
      expect(cubit.state.messages.single.id, 'new-live-turn');
    },
  );

  test('stream error survives finish events and connection closure', () async {
    await cubit.loadWorkspace('ws');
    when(
      () => repository.streamChat(
        chatId: 'cached',
        wsId: 'ws',
        workspaceContextId: 'ws',
        modelId: 'model',
        messages: any(named: 'messages'),
        thinkingMode: AssistantThinkingMode.fast,
        creditSource: AssistantCreditSource.workspace,
        timezone: 'UTC',
        attachments: any(named: 'attachments'),
        creditWsId: 'ws',
      ),
    ).thenAnswer(
      (_) => Stream.fromIterable([
        const AssistantJsonStreamEvent({
          'type': 'error',
          'errorText': 'Service unavailable',
        }),
        const AssistantJsonStreamEvent({'type': 'finish'}),
        const AssistantDoneStreamEvent(),
      ]),
    );
    await cubit.submit(
      wsId: 'ws',
      message: 'Hello',
      modelId: 'model',
      thinkingMode: AssistantThinkingMode.fast,
      creditSource: AssistantCreditSource.workspace,
      workspaceContextId: 'ws',
      timezone: 'UTC',
      creditWsId: 'ws',
    );
    await Future<void>.delayed(const Duration(milliseconds: 300));
    expect(cubit.state.status, AssistantChatStatus.error);
    expect(cubit.state.error, 'Service unavailable');
    expect(cubit.state.messages.single.role, 'user');
    final originalMessageId = cubit.state.messages.single.id;

    await cubit.retryLast(
      wsId: 'ws',
      modelId: 'model',
      thinkingMode: AssistantThinkingMode.fast,
      creditSource: AssistantCreditSource.workspace,
      workspaceContextId: 'ws',
      timezone: 'UTC',
      creditWsId: 'ws',
    );
    await Future<void>.delayed(const Duration(milliseconds: 300));
    expect(
      cubit.state.messages.where((message) => message.role == 'user'),
      hasLength(1),
    );
    expect(cubit.state.messages.single.id, originalMessageId);
    verify(
      () => repository.streamChat(
        chatId: 'cached',
        wsId: 'ws',
        workspaceContextId: 'ws',
        modelId: 'model',
        messages: any(named: 'messages'),
        thinkingMode: AssistantThinkingMode.fast,
        creditSource: AssistantCreditSource.workspace,
        timezone: 'UTC',
        attachments: any(named: 'attachments'),
        creditWsId: 'ws',
      ),
    ).called(2);
  });
  test('cached conversation renders before delayed history', () async {
    final history = Completer<List<AssistantChatRecord>>();
    when(
      () => repository.fetchRecentChats(wsId: 'ws'),
    ).thenAnswer((_) => history.future);
    await cubit.loadWorkspace('ws');
    expect(cubit.state.status, AssistantChatStatus.idle);
    expect(cubit.state.chat?.id, 'cached');
    expect(history.isCompleted, isFalse);
    history.complete([const AssistantChatRecord(id: 'history')]);
    await Future<void>.delayed(Duration.zero);
    expect(cubit.state.history.single.id, 'history');
  });

  test('history failure does not hide a restored conversation', () async {
    when(
      () => repository.fetchRecentChats(wsId: 'ws'),
    ).thenThrow(Exception('offline'));
    await cubit.loadWorkspace('ws');
    expect(cubit.state.chat?.id, 'cached');
    expect(cubit.state.status, AssistantChatStatus.idle);
    expect(cubit.state.error, isNull);
  });

  test('a new workspace rejects delayed restore and history', () async {
    final restore = Completer<AssistantRestoredChat?>();
    final history = Completer<List<AssistantChatRecord>>();
    when(
      () => repository.restoreChat(wsId: 'old', chatId: 'cached'),
    ).thenAnswer((_) => restore.future);
    when(
      () => repository.fetchRecentChats(wsId: 'old'),
    ).thenAnswer((_) => history.future);
    final loading = cubit.loadWorkspace('old');
    await Future<void>.delayed(Duration.zero);
    await cubit.loadWorkspace('new');
    restore.complete(
      const AssistantRestoredChat(
        chat: AssistantChatRecord(id: 'old-chat'),
        messages: [],
        attachmentsByMessageId: {},
      ),
    );
    history.complete([const AssistantChatRecord(id: 'old-history')]);
    await loading;
    expect(cubit.state.workspaceId, 'new');
    expect(cubit.state.chat?.id, 'cached');
    expect(cubit.state.history, isEmpty);
  });

  test('starting a new conversation cancels an outstanding restore', () async {
    final restore = Completer<AssistantRestoredChat?>();
    when(
      () => repository.restoreChat(wsId: 'ws', chatId: 'cached'),
    ).thenAnswer((_) => restore.future);
    final loading = cubit.loadWorkspace('ws');
    await Future<void>.delayed(Duration.zero);
    await cubit.resetConversation('ws');
    restore.complete(restored);
    await loading;
    expect(cubit.state.chat, isNull);
    expect(cubit.state.messages, isEmpty);
    expect(cubit.state.status, AssistantChatStatus.idle);
  });
  test('older same-workspace history cannot replace a newer refresh', () async {
    await cubit.loadWorkspace('ws');
    final older = Completer<List<AssistantChatRecord>>();
    var calls = 0;
    when(() => repository.fetchRecentChats(wsId: 'ws')).thenAnswer((_) {
      return calls++ == 0
          ? older.future
          : Future.value([const AssistantChatRecord(id: 'newest')]);
    });
    final first = cubit.refreshHistory();
    await cubit.refreshHistory();
    older.complete([const AssistantChatRecord(id: 'stale')]);
    await first;
    expect(cubit.state.history.single.id, 'newest');
  });

  test(
    'submission during chat switch cannot enter the previous conversation',
    () async {
      await cubit.loadWorkspace('ws');
      final pending = Completer<AssistantRestoredChat?>();
      when(
        () => repository.restoreChat(
          wsId: 'ws',
          chatId: 'next',
          forceRefresh: true,
        ),
      ).thenAnswer((_) => pending.future);
      final opening = cubit.openChatById('ws', 'next');
      await cubit.submit(
        wsId: 'ws',
        message: 'private next chat message',
        modelId: 'model',
        thinkingMode: AssistantThinkingMode.fast,
        creditSource: AssistantCreditSource.personal,
        workspaceContextId: 'personal',
        timezone: 'UTC',
      );
      expect(cubit.state.status, AssistantChatStatus.restoring);
      expect(cubit.state.queuedMessages, isEmpty);
      expect(cubit.state.messages, isEmpty);
      pending.complete(
        const AssistantRestoredChat(
          chat: AssistantChatRecord(id: 'next'),
          messages: [],
          attachmentsByMessageId: {},
        ),
      );
      await opening;
      expect(cubit.state.chat?.id, 'next');
    },
  );
}
