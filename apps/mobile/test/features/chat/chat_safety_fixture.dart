import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/data/chat_stream_parser.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

import 'chat_cubit_fixture.dart';

/// Refuses every send the way the server does in a blocked direct chat.
class BlockedSendRepository extends CubitFixtureRepository {
  BlockedSendRepository(super.api);

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
    throw const ApiException(message: 'chat_blocked', statusCode: 403);
  }
}

/// [threadId] as a direct conversation between the viewer and [userId].
ChatConversation directWith(String userId) => ChatConversation(
  id: threadId,
  wsId: fixtureWs,
  type: ChatConversationType.direct,
  updatedAt: fixtureStart,
  members: [
    for (final id in ['me', userId])
      ChatConversationMember(
        id: 'member-$id',
        conversationId: threadId,
        userId: id,
        user: ChatUserProfile(id: id, displayName: id),
        role: 'member',
      ),
  ],
);
