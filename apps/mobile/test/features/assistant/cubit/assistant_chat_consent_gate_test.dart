import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_memory_file.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';

import '../consent/mira_ai_consent_fakes.dart';

class _Repository extends Mock implements AssistantRepository {}

class _Preferences extends Mock implements AssistantPreferences {}

void main() {
  late _Repository repository;
  late _Preferences preferences;
  late FakeMiraAiConsentGate gate;
  late AssistantChatCubit cubit;
  late List<String> calls;
  late Stream<AssistantStreamEvent> Function() reply;
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
    gate = FakeMiraAiConsentGate();
    calls = [];
    reply = Stream.empty;
    when(() => repository.hasUnknownChatCreation(any()))
        .thenAnswer((_) async => false);
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
    var ids = 0;
    when(repository.generateUuid).thenAnswer((_) => 'id-${ids++}');
    when(() => preferences.loadChatId(any())).thenAnswer((_) async => 'cached');
    when(
      () => repository.restoreChat(
        wsId: any(named: 'wsId'),
        chatId: any(named: 'chatId'),
        forceRefresh: any(named: 'forceRefresh'),
        cacheOrigin: any(named: 'cacheOrigin'),
      ),
    ).thenAnswer((_) async => restored);
    when(() => repository.fetchRecentChats(wsId: any(named: 'wsId')))
        .thenAnswer((_) async => []);
    when(
      () => repository.uploadAttachment(
        wsId: any(named: 'wsId'),
        chatId: any(named: 'chatId'),
        file: any(named: 'file'),
        onProgress: any(named: 'onProgress'),
      ),
    ).thenAnswer((invocation) async {
      calls.add('upload');
      final file =
          invocation.namedArguments[#file] as AssistantFilePickerResult;
      return AssistantAttachment(
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.mimeType,
        storagePath: 'chats/cached/${file.name}',
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
      return reply();
    });
    cubit = AssistantChatCubit(
      repository: repository,
      preferences: preferences,
      onWorkspaceContextChanged: (_) async {},
      onSoulRefreshRequested: () async {},
      onImmersiveModeChanged: (_) {},
      onChatRestored: (_) async {},
      aiConsentGate: gate,
    );
    addTearDown(cubit.close);
  });

  Future<void> submit() async {
    await cubit.submit(
      wsId: 'ws',
      message: 'Synthetic question',
      modelId: 'model',
      thinkingMode: AssistantThinkingMode.fast,
      creditSource: AssistantCreditSource.workspace,
      workspaceContextId: 'ws',
      timezone: 'UTC',
    );
    await Future<void>.delayed(const Duration(milliseconds: 300));
  }

  test('a text send without consent asks and requests nothing', () async {
    await cubit.loadWorkspace('ws');
    await submit();

    expect(gate.requests, 1);
    expect(calls, isEmpty);
    expect(cubit.state.messages, isEmpty);
    expect(cubit.state.queuedMessages, isEmpty);
  });

  test('a text send goes out once the user allows', () async {
    gate.allow = true;
    await cubit.loadWorkspace('ws');
    await submit();

    expect(gate.requests, 1);
    expect(calls, ['send']);
    await submit();
    expect(gate.requests, 1, reason: 'A held grant does not ask again.');
  });

  test('a voice message without consent is held, never uploaded', () async {
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

    expect(calls, isEmpty);
    final voice = cubit.state.attachmentsByMessageId.values.single.single;
    expect(voice.failure, AssistantAttachmentFailure.consentRequired);
    expect(voice.failure!.retryable, isTrue);

    gate.allow = true;
    await cubit.retryVoiceMessage(cubit.state.messages.single.id);
    await Future<void>.delayed(const Duration(milliseconds: 300));
    expect(calls, ['upload', 'send']);
  });

  test('an attachment without consent stays in the composer', () async {
    await cubit.loadWorkspace('ws');
    await cubit.addComposerAttachments(
      wsId: 'ws',
      files: [
        AssistantMemoryFile(name: 'notes.txt', bytes: Uint8List.fromList([1])),
      ],
      modelId: 'model',
      timezone: 'UTC',
    );

    expect(calls, isEmpty);
    final attachment = cubit.state.composerAttachments.single;
    expect(attachment.uploadState, AssistantAttachmentUploadState.error);
    expect(attachment.failure, AssistantAttachmentFailure.consentRequired);

    gate.allow = true;
    await cubit.retryComposerAttachment(
      wsId: 'ws',
      attachmentId: attachment.id,
      modelId: 'model',
      timezone: 'UTC',
    );
    expect(calls, ['upload']);
    expect(cubit.state.composerAttachments.single.isUploaded, isTrue);
  });

  test('a server consent refusal forgets the grant to ask again', () async {
    gate
      ..granted = true
      ..allow = true;
    reply = () => Stream.error(
      const ApiException(
        message: 'ai_consent_required',
        statusCode: 403,
        code: 'ai_consent_required',
      ),
    );
    await cubit.loadWorkspace('ws');
    await submit();

    expect(calls, ['send']);
    expect(gate.refusals, 1);
    expect(gate.granted, isFalse);
    expect(cubit.state.status, AssistantChatStatus.error);
  });
}
