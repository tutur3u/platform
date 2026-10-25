import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';

import 'assistant_chat_persistence_actions_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => registerFallbackValue(() => true));
  late ActionsApi api;
  late ActionsRepository repository;
  late AssistantChatCubit cubit;

  setUp(() async {
    api = ActionsApi();
    repository = ActionsRepository(api);
    final preferences = ActionsPreferences();
    when(
      () => preferences.saveChatId(
        any(),
        any(),
        shouldWrite: any(named: 'shouldWrite'),
      ),
    ).thenAnswer((_) async {});
    cubit = actionsCubit(repository, preferences);
    await cubit.openChatById(actionWorkspace, actionChat);
  });
  tearDown(() async {
    await cubit.close();
    await repository.frames.close();
  });

  Future<void> submit(String text) => cubit.submit(
    wsId: actionWorkspace,
    message: text,
    modelId: 'model',
    thinkingMode: AssistantThinkingMode.fast,
    creditSource: AssistantCreditSource.workspace,
    workspaceContextId: actionWorkspace,
    timezone: 'UTC',
  );

  test(
    'reply selection requires a persisted native row, not a bare UUID',
    () async {
      expect(cubit.canPersistMessage(actionMessage), isTrue);
      expect(cubit.setReplyTarget(actionMessage), isTrue);
      expect(cubit.state.replyTarget, actionRow);
      cubit.clearReplyTarget();
      expect(cubit.state.replyTarget, isNull);
      repository.rows = [actionRow.copyWith(isPersisted: false)];
      await cubit.openChatById(actionWorkspace, actionChat);
      expect(cubit.canPersistMessage(actionMessage), isFalse);
      expect(cubit.setReplyTarget(actionMessage), isFalse);
      expect(
        await cubit.toggleReaction(actionMessage, 'heart'),
        AssistantReactionResult.unavailable,
      );
      verifyNever(
        () => api.postJsonAcknowledged(
          any(),
          any(),
          actorId: any(named: 'actorId'),
          isCurrent: any(named: 'isCurrent'),
        ),
      );
      repository.rows = [actionRow];
      for (final prefix in ['ai-chat-', 'legacy-ai-']) {
        await cubit.openChatById(actionWorkspace, '$prefix$actionChat');
        expect(cubit.canPersistMessage(actionMessage), isFalse);
        expect(cubit.setReplyTarget(actionMessage), isFalse);
        expect(
          await cubit.toggleReaction(actionMessage, 'heart'),
          AssistantReactionResult.unavailable,
        );
      }
    },
  );

  test(
    'actor switch immediately disables persistence of previous actor rows',
    () {
      repository.actor = actionOther;
      expect(cubit.setReplyTarget(actionMessage), isFalse);
      expect(cubit.canPersistMessage(actionMessage), isFalse);
    },
  );

  test('selection clears when changing conversation', () async {
    cubit.setReplyTarget(actionMessage);
    await cubit.openChatById(actionWorkspace, actionOther);
    expect(cubit.state.replyTarget, isNull);
  });

  test(
    'queue and optimistic message capture reply before composer changes',
    () async {
      expect(cubit.setReplyTarget(actionMessage), isTrue);
      await submit('Reply body');
      expect(cubit.state.replyTarget, isNull);
      // A selection made during the debounce belongs to the next submission.
      expect(cubit.setReplyTarget(actionMessage), isTrue);
      cubit.clearReplyTarget();
      await Future<void>.delayed(const Duration(milliseconds: 300));
      final sent = repository.turns.single.lastWhere((m) => m.role == 'user');
      expect(sent.replyToMessageId, actionMessage);
      expect(sent.isPersisted, isFalse);
      expect(sent.clientRequestId, sent.id);
      expect(cubit.canPersistMessage(sent.id), isFalse);
      expect(cubit.state.messages.last.replyToMessageId, actionMessage);

      await cubit.retryLast(
        wsId: actionWorkspace,
        modelId: 'model',
        thinkingMode: AssistantThinkingMode.fast,
        creditSource: AssistantCreditSource.workspace,
        workspaceContextId: actionWorkspace,
        timezone: 'UTC',
      );
      await Future<void>.delayed(const Duration(milliseconds: 300));
      final retried = repository.turns.last.lastWhere((m) => m.role == 'user');
      expect(repository.turns, hasLength(2));
      expect(retried.clientRequestId, sent.clientRequestId);
      expect(retried.replyToMessageId, actionMessage);
    },
  );

  test(
    'native USER acknowledgment keeps reply/reactions and enables durability',
    () async {
      cubit.setReplyTarget(actionMessage);
      await submit('Reply body');
      await Future<void>.delayed(const Duration(milliseconds: 300));
      final optimistic = cubit.state.messages.last;
      final receipt = optimistic.copyWith(id: actionOther, isPersisted: true);
      final next = cubit.stream.firstWhere(
        (state) =>
            state.messages.any((m) => m.id == actionOther && m.isPersisted),
      );
      repository.frames.add(
        AssistantJsonStreamEvent({
          'type': 'saved-user-message',
          'messageId': actionOther,
          'clientRequestId': optimistic.clientRequestId,
          'text': 'Reply body',
          'message': receipt.toJson(),
          'nativeReceipt': {
            'actorId': actionActor,
            'workspaceId': actionWorkspace,
            'chatId': actionChat,
            'requestId': optimistic.clientRequestId,
            'messageId': actionOther,
            'text': 'Reply body',
            'replyToMessageId': actionMessage,
            'attachments': const <Object>[],
          },
        }),
      );
      final state = await next;
      final saved = state.messages.last;
      expect(saved.id, actionOther);
      expect(saved.clientRequestId, optimistic.clientRequestId);
      expect(saved.replyToMessageId, actionMessage);
      expect(saved.isPersisted, isTrue);
      expect(cubit.canPersistMessage(actionOther), isTrue);
    },
  );

  test(
    'native attachment ACK relocates cache row and grants eligibility',
    () async {
      const savedId = '77777777-7777-4777-8777-777777777777';
      const attachment = AssistantAttachment(
        id: 'fixture',
        name: 'fixture.txt',
        size: 1,
        type: 'text/plain',
        storagePath: 'fixture/file',
        uploadState: AssistantAttachmentUploadState.uploaded,
      );
      const pending = AssistantMessage(
        id: actionOther,
        role: 'user',
        clientRequestId: actionOther,
        replyToMessageId: actionMessage,
        parts: [AssistantMessagePart(type: 'text', text: 'Attachment reply')],
      );
      repository
        ..rows = [actionRow, pending]
        ..savedAttachments = {
          actionOther: [attachment],
        };
      await cubit.openChatById(actionWorkspace, actionChat);
      await cubit.submit(
        wsId: actionWorkspace,
        message: 'Attachment reply',
        modelId: 'model',
        thinkingMode: AssistantThinkingMode.fast,
        creditSource: AssistantCreditSource.workspace,
        workspaceContextId: actionWorkspace,
        timezone: 'UTC',
        retryMessageId: actionOther,
      );
      await Future<void>.delayed(const Duration(milliseconds: 300));
      final next = cubit.stream.firstWhere(
        (state) => state.messages.any((m) => m.id == savedId && m.isPersisted),
      );
      repository.frames.add(
        AssistantJsonStreamEvent({
          'type': 'saved-user-message',
          'messageId': savedId,
          'clientRequestId': actionOther,
          'text': 'Attachment reply',
          'message': pending.copyWith(id: savedId, isPersisted: true).toJson(),
          'nativeReceipt': {
            'actorId': actionActor,
            'workspaceId': actionWorkspace,
            'chatId': actionChat,
            'requestId': actionOther,
            'messageId': savedId,
            'text': 'Attachment reply',
            'replyToMessageId': actionMessage,
            'attachments': [
              {
                'path': attachment.storagePath,
                'name': attachment.name,
                'type': attachment.type,
                'size': attachment.size,
              },
            ],
          },
        }),
      );
      await next;
      expect(cubit.canPersistMessage(savedId), isTrue);
      expect(cubit.state.attachmentsByMessageId[savedId], [attachment]);
      expect(
        cubit.state.attachmentsByMessageId.containsKey(actionOther),
        isFalse,
      );
      expect(
        repository.snapshots.last.restored.messages.last.replyToMessageId,
        actionMessage,
      );
    },
  );

  test('unproven saved UUID never grants private FK eligibility', () async {
    await submit('Unproven');
    await Future<void>.delayed(const Duration(milliseconds: 300));
    final optimistic = cubit.state.messages.last;
    final next = cubit.stream.firstWhere(
      (state) => state.messages.any((m) => m.id == actionOther),
    );
    repository.frames.add(
      AssistantJsonStreamEvent({
        'type': 'saved-user-message',
        'messageId': actionOther,
        'clientRequestId': optimistic.clientRequestId,
        'text': 'Unproven',
      }),
    );
    await next;
    expect(cubit.state.messages.last.isPersisted, isFalse);
    expect(cubit.canPersistMessage(actionOther), isFalse);
  });
}
