import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_memory_file.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
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
    registerFallbackValue(AssistantThinkingMode.fast);
    registerFallbackValue(AssistantCreditSource.workspace);
    registerFallbackValue(
      AssistantFilePickerResult(
        id: 'fallback',
        file: AssistantMemoryFile(name: 'a.m4a', bytes: Uint8List(0)),
        name: 'a.m4a',
        size: 0,
        path: '',
        mimeType: 'audio/mp4',
      ),
    );
  });

  setUp(() {
    repository = _Repository();
    preferences = _Preferences();
    when(
      () => repository.hasUnknownChatCreation(any()),
    ).thenAnswer((_) async => false);
    when(() => repository.currentActorId).thenReturn('actor');
    when(() => preferences.matchesResetActor('actor')).thenReturn(true);
    when(
      () => preferences.saveWorkspaceContextIdAcknowledged(
        any(),
        any(),
        actorId: any(named: 'actorId'),
        isCurrent: any(named: 'isCurrent'),
      ),
    ).thenAnswer((_) async => true);
    when(repository.generateUuid).thenReturn('attachment-1');
    when(() => preferences.loadChatId(any())).thenAnswer((_) async => 'cached');
    when(
      () => repository.restoreChat(
        wsId: any(named: 'wsId'),
        chatId: any(named: 'chatId'),
        forceRefresh: any(named: 'forceRefresh'),
        cacheOrigin: any(named: 'cacheOrigin'),
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
    'voice creates once, uploads, retries without duplicate message',
    () async {
      when(() => preferences.loadChatId(any())).thenAnswer((_) async => null);
      when(
        () => preferences.saveChatId(
          any(),
          any(),
          shouldWrite: any(named: 'shouldWrite'),
        ),
      ).thenAnswer((_) async {});
      final calls = <String>[];
      when(
        () => repository.createChat(
          id: any(named: 'id'),
          wsId: any(named: 'wsId'),
          modelId: any(named: 'modelId'),
          message: any(named: 'message'),
          timezone: any(named: 'timezone'),
          initialSettings: any(named: 'initialSettings'),
          isCurrent: any(named: 'isCurrent'),
        ),
      ).thenAnswer((_) async {
        calls.add('create');
        return const AssistantChatRecord(id: 'native');
      });
      var attempts = 0;
      when(
        () => repository.uploadAttachment(
          wsId: 'ws',
          chatId: 'native',
          file: any(named: 'file'),
          onProgress: any(named: 'onProgress'),
        ),
      ).thenAnswer((invocation) async {
        calls.add('upload');
        attempts++;
        if (attempts == 1) {
          throw const AssistantAttachmentUploadException(
            AssistantAttachmentFailure.network,
          );
        }
        return const AssistantAttachment(
          id: 'attachment-1',
          name: 'voice.m4a',
          size: 4,
          type: 'audio/mp4',
          storagePath: 'chats/native/voice.m4a',
          uploadState: AssistantAttachmentUploadState.uploaded,
        );
      });
      when(
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
          admission: any(named: 'admission'),
        ),
      ).thenAnswer((_) {
        calls.add('send');
        return const Stream.empty();
      });
      await cubit.loadWorkspace('ws');
      await cubit.sendVoiceMessage(
        wsId: 'ws',
        file: AssistantMemoryFile(name: 'voice.m4a', bytes: Uint8List(4)),
        modelId: 'model',
        timezone: 'UTC',
        message: 'Voice',
        thinkingMode: AssistantThinkingMode.fast,
        creditSource: AssistantCreditSource.workspace,
        workspaceContextId: 'ws',
      );
      expect(calls, ['create', 'upload']);
      expect(cubit.state.composerAttachments, isEmpty);
      expect(cubit.state.messages, hasLength(1));
      expect(
        cubit.state.attachmentsByMessageId.values.single.single.failure,
        AssistantAttachmentFailure.network,
      );
      await cubit.retryVoiceMessage('attachment-1');
      await Future<void>.delayed(const Duration(milliseconds: 300));
      expect(calls, ['create', 'upload', 'upload', 'send']);
      expect(cubit.state.messages.where((m) => m.role == 'user'), hasLength(1));
      expect(cubit.state.composerAttachments, isEmpty);
    },
  );
  test(
    'voice creates then uploads then sends without composer staging',
    () async {
      when(() => preferences.loadChatId(any())).thenAnswer((_) async => null);
      when(
        () => preferences.saveChatId(
          any(),
          any(),
          shouldWrite: any(named: 'shouldWrite'),
        ),
      ).thenAnswer((_) async {});
      final calls = <String>[];
      when(
        () => repository.createChat(
          id: any(named: 'id'),
          wsId: any(named: 'wsId'),
          modelId: any(named: 'modelId'),
          message: any(named: 'message'),
          timezone: any(named: 'timezone'),
          initialSettings: any(named: 'initialSettings'),
          isCurrent: any(named: 'isCurrent'),
        ),
      ).thenAnswer((_) async {
        calls.add('create');
        return const AssistantChatRecord(id: 'native');
      });
      var attempts = 0;
      when(
        () => repository.uploadAttachment(
          wsId: 'ws',
          chatId: 'native',
          file: any(named: 'file'),
          onProgress: any(named: 'onProgress'),
        ),
      ).thenAnswer((invocation) async {
        calls.add('upload');
        attempts++;
        if (attempts == 0) {
          throw const AssistantAttachmentUploadException(
            AssistantAttachmentFailure.network,
          );
        }
        return const AssistantAttachment(
          id: 'attachment-1',
          name: 'voice.m4a',
          size: 4,
          type: 'audio/mp4',
          storagePath: 'chats/native/voice.m4a',
          uploadState: AssistantAttachmentUploadState.uploaded,
        );
      });
      when(
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
          admission: any(named: 'admission'),
        ),
      ).thenAnswer((_) {
        calls.add('send');
        return const Stream.empty();
      });
      await cubit.loadWorkspace('ws');
      await cubit.sendVoiceMessage(
        wsId: 'ws',
        file: AssistantMemoryFile(name: 'voice.m4a', bytes: Uint8List(4)),
        modelId: 'model',
        timezone: 'UTC',
        message: 'Voice',
        thinkingMode: AssistantThinkingMode.fast,
        creditSource: AssistantCreditSource.workspace,
        workspaceContextId: 'ws',
      );
      await Future<void>.delayed(const Duration(milliseconds: 300));
      expect(calls, ['create', 'upload', 'send']);
      expect(cubit.state.messages.where((m) => m.role == 'user'), hasLength(1));
      expect(cubit.state.composerAttachments, isEmpty);
    },
  );
}
