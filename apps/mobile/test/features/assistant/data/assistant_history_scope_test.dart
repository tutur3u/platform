import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

class _Chats extends Mock implements ChatRepository {}

void main() {
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
