import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_memory_file.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_reset_preferences.dart';
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

  Future<void> attachVoiceNote() => cubit.addComposerAttachments(
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

  test('a failed upload keeps its reason and recovers on retry', () async {
    await cubit.loadWorkspace('ws');
    var attempts = 0;
    when(
      () => repository.uploadAttachment(
        wsId: 'ws',
        chatId: 'cached',
        file: any(named: 'file'),
        onProgress: any(named: 'onProgress'),
      ),
    ).thenAnswer((invocation) async {
      attempts++;
      if (attempts == 1) {
        throw const AssistantAttachmentUploadException(
          AssistantAttachmentFailure.network,
        );
      }
      (invocation.namedArguments[#onProgress] as void Function(double))(0.5);
      return const AssistantAttachment(
        id: 'attachment-1',
        name: 'voice-message.m4a',
        size: 4,
        type: 'audio/mp4',
        storagePath: 'chats/cached/voice.m4a',
        uploadState: AssistantAttachmentUploadState.uploaded,
      );
    });

    await attachVoiceNote();
    final failed = cubit.state.composerAttachments.single;
    expect(failed.uploadState, AssistantAttachmentUploadState.error);
    expect(failed.failure, AssistantAttachmentFailure.network);
    expect(failed.failure!.retryable, isTrue);

    final progress = <double?>[];
    final subscription = cubit.stream.listen(
      (state) => progress.add(state.composerAttachments.single.uploadProgress),
    );
    await cubit.retryComposerAttachment(
      wsId: 'ws',
      attachmentId: 'attachment-1',
      modelId: 'model',
      timezone: 'UTC',
    );
    await subscription.cancel();

    expect(attempts, 2);
    expect(progress, contains(0.5));
    final uploaded = cubit.state.composerAttachments.single;
    expect(uploaded.isUploaded, isTrue);
    expect(uploaded.failure, isNull);
  });

  test(
    'server rejections surface their own reason, not a generic one',
    () async {
      await cubit.loadWorkspace('ws');
      when(
        () => repository.uploadAttachment(
          wsId: any(named: 'wsId'),
          chatId: any(named: 'chatId'),
          file: any(named: 'file'),
          onProgress: any(named: 'onProgress'),
        ),
      ).thenThrow(
        const ApiException(
          message: 'File is too large',
          statusCode: 413,
          code: 'file_too_large',
        ),
      );

      await attachVoiceNote();

      final failed = cubit.state.composerAttachments.single;
      expect(failed.failure, AssistantAttachmentFailure.tooLarge);
      expect(failed.failure!.retryable, isFalse);
    },
  );

  Future<List<Completer<AssistantAttachment>>> failThenHold() async {
    await cubit.loadWorkspace('ws');
    var attempts = 0;
    final held = <Completer<AssistantAttachment>>[];
    when(
      () => repository.uploadAttachment(
        wsId: 'ws',
        chatId: 'cached',
        file: any(named: 'file'),
        onProgress: any(named: 'onProgress'),
      ),
    ).thenAnswer((_) {
      attempts++;
      if (attempts == 1) {
        throw const AssistantAttachmentUploadException(
          AssistantAttachmentFailure.network,
        );
      }
      final completer = Completer<AssistantAttachment>();
      held.add(completer);
      return completer.future;
    });
    await attachVoiceNote();
    expect(
      cubit.state.composerAttachments.single.uploadState,
      AssistantAttachmentUploadState.error,
    );
    return held;
  }

  test('a double-tapped Retry starts one upload', () async {
    final held = await failThenHold();
    Future<void> retry() => cubit.retryComposerAttachment(
      wsId: 'ws',
      attachmentId: 'attachment-1',
      modelId: 'model',
      timezone: 'UTC',
    );

    final first = retry();
    final second = retry();
    await second;
    await pumpEventQueue();
    expect(held, hasLength(1));
    held.single.complete(
      const AssistantAttachment(
        id: 'attachment-1',
        name: 'voice-message.m4a',
        size: 4,
        type: 'audio/mp4',
        storagePath: 'chats/cached/voice.m4a',
        uploadState: AssistantAttachmentUploadState.uploaded,
      ),
    );
    await first;
    expect(cubit.state.composerAttachments.single.isUploaded, isTrue);
  });

  test('Retry after the actor changed does not upload', () async {
    final held = await failThenHold();

    await cubit.retryComposerAttachment(
      wsId: 'ws',
      attachmentId: 'attachment-1',
      modelId: 'model',
      timezone: 'UTC',
      isCurrentActor: () => false,
    );
    await cubit.retryComposerAttachment(
      wsId: 'ws',
      attachmentId: 'attachment-1',
      modelId: 'model',
      timezone: 'UTC',
      expectedWorkspaceVersion: cubit.attachmentScopeVersion - 1,
    );

    expect(held, isEmpty);
    expect(
      cubit.state.composerAttachments.single.uploadState,
      AssistantAttachmentUploadState.error,
    );
  });

  test('removing an attachment discards its retained source', () async {
    await cubit.loadWorkspace('ws');
    when(
      () => repository.uploadAttachment(
        wsId: any(named: 'wsId'),
        chatId: any(named: 'chatId'),
        file: any(named: 'file'),
        onProgress: any(named: 'onProgress'),
      ),
    ).thenThrow(
      const AssistantAttachmentUploadException(
        AssistantAttachmentFailure.server,
      ),
    );
    await attachVoiceNote();
    await cubit.removeComposerAttachment(
      wsId: 'ws',
      attachmentId: 'attachment-1',
    );
    await cubit.retryComposerAttachment(
      wsId: 'ws',
      attachmentId: 'attachment-1',
      modelId: 'model',
      timezone: 'UTC',
    );

    expect(cubit.state.composerAttachments, isEmpty);
    verify(
      () => repository.uploadAttachment(
        wsId: any(named: 'wsId'),
        chatId: any(named: 'chatId'),
        file: any(named: 'file'),
        onProgress: any(named: 'onProgress'),
      ),
    ).called(1);
  });

  Future<void> createChatThrows(Object error) async => when(
    () => repository.createChat(
      id: any(named: 'id'),
      wsId: any(named: 'wsId'),
      modelId: any(named: 'modelId'),
      message: any(named: 'message'),
      timezone: any(named: 'timezone'),
      initialSettings: any(named: 'initialSettings'),
      isCurrent: any(named: 'isCurrent'),
    ),
  ).thenThrow(error);

  for (final held in [
    const AssistantCreationUncertainException('held'),
    const AssistantCreationSelectedException(),
  ]) {
    test('a held creation (${held.runtimeType}) asks for New chat, '
        'not a retry', () async {
      // After a reset and an app restart the creation envelope stays held:
      // creating fails on device, so the voice note never reached the server
      // yet surfaced as a retryable "Upload didn't finish".
      when(
        () => repository.hasUnknownChatCreation(any()),
      ).thenAnswer((_) async => true);
      when(() => preferences.loadChatId(any())).thenAnswer((_) async => null);
      await createChatThrows(held);
      await cubit.loadWorkspace('ws');
      expect(cubit.state.creationOutcomeUnknown, isTrue);

      await attachVoiceNote();

      final failed = cubit.state.composerAttachments.single;
      expect(failed.uploadState, AssistantAttachmentUploadState.error);
      expect(failed.failure, AssistantAttachmentFailure.newChatRequired);
      expect(failed.failure!.retryable, isFalse);
      verifyNever(
        () => repository.uploadAttachment(
          wsId: any(named: 'wsId'),
          chatId: any(named: 'chatId'),
          file: any(named: 'file'),
          onProgress: any(named: 'onProgress'),
        ),
      );
    });
  }
}
