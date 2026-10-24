import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/data/chat_stream_parser.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

class _Chats extends ChatRepository {
  _Chats() : super();
  final replies = <String?>[];
  final requests = <String?>[];
  bool mismatchReply = false;
  @override
  Stream<ChatMessageStreamEvent> sendMessageStream(
    String wsId,
    String conversationId, {
    required String content,
    ChatMessageKind kind = ChatMessageKind.user,
    List<ChatAttachmentDraft> attachments = const [],
    String? replyToMessageId,
    String? clientRequestId,
    bool miraMode = false,
    ApiMutationAdmission? admission,
  }) async* {
    admission?.recordDispatchPossible();
    replies.add(replyToMessageId);
    requests.add(clientRequestId);
    yield ChatStreamMessageEvent(
      ChatMessage(
        id: _saved,
        conversationId: conversationId,
        content: content,
        kind: kind,
        senderId: _actor,
        metadata: {'clientRequestId': clientRequestId},
        replyToMessageId: mismatchReply ? _saved : replyToMessageId,
        reactions: const [
          ChatReactionSummary(emoji: 'heart', count: 1, userIds: [_actor]),
        ],
      ),
    );
  }
}

const _actor = '33333333-3333-4333-8333-333333333333';
const _workspace = '11111111-1111-4111-8111-111111111111';
const _chat = '44444444-4444-4444-8444-444444444444';
const _reply = '55555555-5555-4555-8555-555555555555';
const _request = '66666666-6666-4666-8666-666666666666';
const _saved = '77777777-7777-4777-8777-777777777777';

void main() {
  setUpAll(() => registerFallbackValue(() => true));
  late _Api api;
  late _Chats chats;
  late AssistantRepository repository;
  setUp(() {
    api = _Api();
    chats = _Chats();
    repository = AssistantRepository(
      apiClient: api,
      tasksApiClient: api,
      chatRepository: chats,
      currentUserId: () => _actor,
    );
    when(() => api.getJson(any())).thenAnswer(
      (_) async => {
        'settings': {
          'conversationId': _chat,
          'modelId': 'model',
          'creditSource': 'workspace',
          'creditWsId': null,
          'thinkingMode': 'fast',
        },
      },
    );
  });
  Stream<AssistantStreamEvent> send(AssistantMessage row) =>
      repository.streamChat(
        chatId: _chat,
        wsId: _workspace,
        workspaceContextId: _workspace,
        modelId: 'model',
        messages: [row],
        thinkingMode: AssistantThinkingMode.fast,
        creditSource: AssistantCreditSource.workspace,
        timezone: 'UTC',
        admission: ApiMutationAdmission(actorId: _actor, isCurrent: () => true),
      );
  const optimistic = AssistantMessage(
    id: _request,
    role: 'user',
    clientRequestId: _request,
    replyToMessageId: _reply,
    parts: [AssistantMessagePart(type: 'text', text: 'Reply body')],
  );

  test(
    'native transport receives stable reply/request IDs after cache retry',
    () async {
      final first = await send(optimistic).toList();
      final cachedRetry = AssistantMessage.fromJson(optimistic.toJson());
      await send(cachedRetry).toList();
      expect(chats.replies, [_reply, _reply]);
      expect(chats.requests, [_request, _request]);
      final acknowledgment = first
          .whereType<AssistantJsonStreamEvent>()
          .firstWhere((event) => event.payload['type'] == 'saved-user-message');
      final message = AssistantMessage.fromJson(
        acknowledgment.payload['message'] as Map<String, dynamic>,
      );
      expect(message.id, _saved);
      expect(message.replyToMessageId, _reply);
      expect(message.reactions.single.userIds, [_actor]);
      expect(message.isPersisted, isTrue);
      expect(
        matchesAssistantNativeUserAcknowledgment(
          acknowledgment.payload['nativeReceipt'],
          actorId: _actor,
          wsId: _workspace,
          chatId: _chat,
          requestId: _request,
          messageId: _saved,
          text: 'Reply body',
          attachments: const [],
          replyToMessageId: _reply,
        ),
        isTrue,
      );
      expect(
        matchesAssistantNativeUserAcknowledgment(
          acknowledgment.payload['nativeReceipt'],
          actorId: _actor,
          wsId: _workspace,
          chatId: _chat,
          requestId: _request,
          messageId: _saved,
          text: 'Reply body',
          attachments: const [],
          replyToMessageId: _saved,
        ),
        isFalse,
      );
    },
  );

  test('mismatched native reply receipt never acknowledges the turn', () async {
    chats.mismatchReply = true;
    await expectLater(send(optimistic).toList(), throwsFormatException);
    expect(chats.replies, [_reply]);
  });

  test(
    'reaction repository refuses legacy namespace without stripping prefix',
    () async {
      for (final prefix in ['ai-chat-', 'legacy-ai-']) {
        await expectLater(
          repository.toggleMessageReaction(
            wsId: _workspace,
            chatId: '$prefix$_chat',
            messageId: _saved,
            emoji: 'heart',
            isCurrent: () => true,
          ),
          throwsFormatException,
        );
      }
      verifyNever(
        () => api.postJsonAcknowledged(
          any(),
          any(),
          actorId: any(named: 'actorId'),
          isCurrent: any(named: 'isCurrent'),
        ),
      );
    },
  );
}
