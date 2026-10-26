import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_history_message.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

import 'assistant_chat_cache_harness.dart';

const _actor = '33333333-3333-4333-8333-333333333333';
const _workspace = '11111111-1111-4111-8111-111111111111';
const _chat = '44444444-4444-4444-8444-444444444444';
const _message = '55555555-5555-4555-8555-555555555555';
const _reply = '66666666-6666-4666-8666-666666666666';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('UUID alone and old cache payloads remain ineligible', () {
    const local = AssistantMessage(id: _message, role: 'user');
    expect(local.isPersisted, isFalse);
    expect(
      AssistantMessage.fromJson(const {
        'id': _message,
        'role': 'assistant',
      }).isPersisted,
      isFalse,
    );
    expect(local, isNot(local.copyWith(isPersisted: true)));
    expect(local, isNot(local.copyWith(replyToMessageId: _reply)));
    expect(local, isNot(local.copyWith(reactionRefreshRequired: true)));
    expect(
      local,
      isNot(
        local.copyWith(
          reactions: const [
            ChatReactionSummary(emoji: 'heart', count: 1, userIds: [_actor]),
          ],
        ),
      ),
    );
  });

  test(
    'native adapter preserves reactions/reply through encrypted cache',
    () async {
      final disk = ChatCacheDisk();
      await disk.setup();
      addTearDown(disk.close);
      final restored = restoreAssistantChatMessage(
        const ChatMessage(
          id: _message,
          conversationId: _chat,
          content: 'Canonical body',
          kind: ChatMessageKind.assistant,
          replyToMessageId: _reply,
          reactions: [
            ChatReactionSummary(emoji: 'heart', count: 1, userIds: [_actor]),
          ],
        ),
      );
      expect(restored.isPersisted, isTrue);
      final snapshot = AssistantRestoredChat(
        chat: const AssistantChatRecord(id: _chat),
        messages: [restored.copyWith(reactionRefreshRequired: true)],
        attachmentsByMessageId: const {},
      );
      final repository = AssistantRepository(
        currentUserId: () => _actor,
        chatCacheStore: disk.store,
      );
      final origin = repository.captureChatCacheOrigin(
        wsId: _workspace,
        chatId: _chat,
        isCurrent: () => true,
      )!;
      final publication = await repository.publishAssistantChatSnapshot(
        origin: origin,
        restored: snapshot,
      );
      expect(publication.status, AssistantChatCacheStatus.published);
      await repository.drainAssistantChatCache();
      await disk.reopen();
      final cached = await disk.store.read<AssistantRestoredChat>(
        key: origin.key,
        decode: (raw) => AssistantRestoredChat.fromJson(
          Map<String, dynamic>.from(raw! as Map),
        ),
      );
      expect(cached.data, snapshot);
      final row = cached.data!.messages.single;
      expect(row.reactions.single.userIds, [_actor]);
      expect(row.replyToMessageId, _reply);
      expect(row.isPersisted, isTrue);
      expect(row.reactionRefreshRequired, isTrue);
      expect(
        AssistantMessage.fromJson(
          jsonDecode(jsonEncode(row.toJson())) as Map<String, dynamic>,
        ),
        row,
      );
      expect(row.copyWith(parts: const []).reactions, row.reactions);
      expect(row.copyWith(parts: const []).replyToMessageId, _reply);
    },
  );
}
