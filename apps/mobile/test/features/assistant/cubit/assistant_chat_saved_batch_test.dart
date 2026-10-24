import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements AssistantRepository {}

class _Preferences extends Mock implements AssistantPreferences {}

const ws = 'workspace';

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() {
    registerFallbackValue(AssistantThinkingMode.fast);
    registerFallbackValue(AssistantCreditSource.workspace);
    registerFallbackValue(<AssistantMessage>[]);
    registerFallbackValue(<AssistantAttachment>[]);
  });
  test(
    'terminal native batch retains every saved row and canonical parts',
    () async {
      registerFallbackValue(
        ApiMutationAdmission(actorId: 'actor', isCurrent: () => true),
      );
      final repository = _Repository();
      final preferences = _Preferences();
      when(() => repository.currentActorId).thenReturn('actor');
      when(
        repository.generateUuid,
      ).thenReturn('11111111-1111-4111-8111-111111111111');
      when(
        () => repository.hasUnknownChatCreation(ws),
      ).thenAnswer((_) async => false);
      when(
        () => repository.fetchRecentChats(wsId: ws),
      ).thenAnswer((_) async => []);
      when(() => preferences.loadChatId(ws)).thenAnswer((_) async => 'chat');
      when(
        () => repository.restoreChat(
          wsId: ws,
          chatId: 'chat',
          cacheOrigin: any(named: 'cacheOrigin'),
        ),
      ).thenAnswer(
        (_) async => const AssistantRestoredChat(
          chat: AssistantChatRecord(id: 'chat'),
          messages: [],
          attachmentsByMessageId: {},
        ),
      );
      final cubit = AssistantChatCubit(
        repository: repository,
        preferences: preferences,
        onWorkspaceContextChanged: (_) async {},
        onSoulRefreshRequested: () async {},
        onImmersiveModeChanged: (_) {},
        onChatRestored: (_) async {},
      );
      addTearDown(cubit.close);
      await cubit.loadWorkspace(ws);
      final reply = StreamController<AssistantStreamEvent>();
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
      ).thenAnswer((_) => reply.stream);
      await cubit.submit(
        wsId: ws,
        message: 'Synthetic',
        modelId: 'model',
        thinkingMode: AssistantThinkingMode.fast,
        creditSource: AssistantCreditSource.workspace,
        workspaceContextId: ws,
        timezone: 'UTC',
      );
      await Future<void>.delayed(const Duration(milliseconds: 300));
      reply
        ..add(
          const AssistantJsonStreamEvent({
            'type': 'start',
            'messageId': 'temporary',
          }),
        )
        ..add(
          const AssistantJsonStreamEvent({
            'type': 'text-delta',
            'delta': 'partial',
          }),
        );
      binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      final done = cubit.stream.firstWhere(
        (s) =>
            s.status == AssistantChatStatus.idle &&
            s.messages.any((m) => m.id == 'second'),
      );
      reply
        ..add(
          AssistantJsonStreamEvent({
            'type': 'saved-messages',
            'messages': [
              const AssistantMessage(
                id: 'first',
                role: 'assistant',
                parts: [AssistantMessagePart(type: 'text', text: 'full first')],
              ).toJson(),
              const AssistantMessage(
                id: 'second',
                role: 'assistant',
                parts: [
                  AssistantMessagePart(type: 'text', text: 'full second'),
                ],
              ).toJson(),
            ],
          }),
        )
        ..add(const AssistantDoneStreamEvent());
      final settled = await done;
      expect(
        settled.messages.where((m) => m.role == 'assistant').map((m) => m.id),
        ['first', 'second'],
      );
      expect(
        settled.messages
            .where((m) => m.role == 'assistant')
            .map((m) => m.parts.single.text),
        ['full first', 'full second'],
      );
      binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await reply.close();
    },
  );
}
