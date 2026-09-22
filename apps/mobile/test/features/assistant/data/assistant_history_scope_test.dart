import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_chat_identity.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

class _Chats extends Mock implements ChatRepository {}

void main() {
  test(
    'Live UUID restores saved turns through the AI conversation namespace',
    () async {
      const uuid = 'dbdee3eb-3b6e-4422-93b4-829b825a8608';
      const conversationId = 'ai-chat-$uuid';
      final api = _Api();
      final chats = _Chats();
      when(() => chats.listMessages('ws', conversationId)).thenAnswer(
        (_) async => [
          ChatMessage(
            id: 'saved-turn',
            conversationId: conversationId,
            content: 'Live saved',
            kind: ChatMessageKind.assistant,
            createdAt: DateTime(2026),
          ),
        ],
      );
      final repository = AssistantRepository(
        apiClient: api,
        tasksApiClient: api,
        chatRepository: chats,
      );
      final restored = await repository.restoreChat(
        wsId: 'ws',
        chatId: assistantLiveConversationId(uuid),
        forceRefresh: true,
      );
      expect(restored?.chat?.id, conversationId);
      expect(restored?.messages.single.parts.single.text, 'Live saved');
      expect(isSameAssistantLiveChat(restored?.chat?.id, uuid), isTrue);
      verifyNever(() => chats.listMessages('ws', uuid));
      verifyNever(() => api.postJson(any(), any()));
    },
  );

  test('Live identity distinguishes native threads and unrelated sessions', () {
    const uuid = 'dbdee3eb-3b6e-4422-93b4-829b825a8608';
    expect(assistantLiveConversationId('legacy-ai-$uuid'), 'ai-chat-$uuid');
    expect(assistantLiveConversationId('ai-chat-$uuid'), 'ai-chat-$uuid');
    expect(isSameAssistantLiveChat(null, null), isFalse);
    expect(isSameAssistantLiveChat('ai-agent-thread-$uuid', uuid), isFalse);
    expect(
      isSameAssistantLiveChat(
        'ai-chat-$uuid',
        '00000000-0000-4000-8000-000000000000',
      ),
      isFalse,
    );
    expect(() => assistantLiveConversationId('invalid'), throwsArgumentError);
  });

  test('Assistant history excludes read-only external agent mirrors', () async {
    final api = _Api();
    final chats = _Chats();
    when(() => chats.listConversations('ws')).thenAnswer(
      (_) async => ChatConversationPage(
        conversations: [
          for (final id in ['mira', 'ai-agent-thread-external'])
            ChatConversation(
              id: id,
              wsId: 'ws',
              type: ChatConversationType.ai,
              updatedAt: DateTime(2026),
            ),
        ],
      ),
    );
    final repository = AssistantRepository(
      apiClient: api,
      tasksApiClient: api,
      chatRepository: chats,
    );
    expect((await repository.fetchRecentChats(wsId: 'ws')).map((c) => c.id), [
      'mira',
    ]);
    expect(
      await repository.restoreChat(
        wsId: 'ws',
        chatId: 'ai-agent-thread-external',
      ),
      isNull,
    );
    verifyNever(() => api.postJson(any(), any()));
  });
}
