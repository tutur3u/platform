import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mocktail/mocktail.dart';

class ChatFixtureApi extends Mock implements ApiClient {}

/// Synthetic people and conversations for Chat renders and page tests.
abstract final class ChatFixtures {
  static const me = ChatUserProfile(id: 'me', displayName: 'Minh Tran');
  static const ada = ChatUserProfile(id: 'ada', displayName: 'Ada Lovelace');
  static const linh = ChatUserProfile(id: 'linh', displayName: 'Linh Pham');

  static DateTime get _today {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day);
  }

  static ChatConversationMember member(
    String conversationId,
    ChatUserProfile user, {
    DateTime? lastReadAt,
    DateTime? pinnedAt,
  }) => ChatConversationMember(
    id: '$conversationId-${user.id}',
    conversationId: conversationId,
    userId: user.id,
    user: user,
    role: 'member',
    lastReadAt: lastReadAt,
    pinnedAt: pinnedAt,
  );

  static ChatMessage message(
    String id,
    String conversationId,
    String content, {
    required ChatUserProfile sender,
    required DateTime at,
    String? replyTo,
    List<ChatReactionSummary> reactions = const [],
    List<ChatAttachment> attachments = const [],
    ChatMessageKind kind = ChatMessageKind.user,
  }) => ChatMessage(
    id: id,
    conversationId: conversationId,
    content: content,
    kind: kind,
    sender: sender,
    senderId: sender.id,
    createdAt: at,
    replyToMessageId: replyTo,
    reactions: reactions,
    attachments: attachments,
  );

  static List<ChatMessage> designMessages() {
    final yesterday = _today.subtract(const Duration(hours: 6));
    final today = _today.add(const Duration(hours: 9));
    return [
      message(
        'm1',
        'design',
        'Morning! The new onboarding flow is ready for review.',
        sender: ada,
        at: yesterday,
      ),
      message(
        'm2',
        'design',
        'I left notes on the **second step**; the copy feels long.',
        sender: ada,
        at: yesterday.add(const Duration(minutes: 1)),
      ),
      message(
        'm3',
        'design',
        'Thanks, I will trim it before standup.',
        sender: me,
        at: yesterday.add(const Duration(minutes: 9)),
        reactions: const [
          ChatReactionSummary(emoji: '\u{1F44D}', count: 2, userIds: ['ada']),
        ],
      ),
      message(
        'm4',
        'design',
        'Here is the updated spec.',
        sender: linh,
        at: today,
        attachments: const [
          ChatAttachment(
            id: 'spec',
            conversationId: 'design',
            filename: 'onboarding-spec.pdf',
            storagePath: 'chat/design/onboarding-spec.pdf',
            contentType: 'application/pdf',
            sizeBytes: 482000,
          ),
        ],
      ),
      message(
        'm5',
        'design',
        'Looks great. Shipping it to QA after lunch.',
        sender: me,
        at: today.add(const Duration(minutes: 12)),
        replyTo: 'm4',
        reactions: const [
          ChatReactionSummary(emoji: '\u{1F389}', count: 1, userIds: ['linh']),
          ChatReactionSummary(emoji: '\u{1F64F}', count: 1, userIds: ['me']),
        ],
      ),
    ];
  }

  static List<ChatConversation> conversations() {
    final today = _today.add(const Duration(hours: 9, minutes: 12));
    return [
      ChatConversation(
        id: 'design',
        wsId: 'ws-1',
        type: ChatConversationType.channel,
        updatedAt: today,
        title: 'design-review',
        memberCount: 3,
        unreadCount: 2,
        members: [
          member(
            'design',
            me,
            lastReadAt: _today.subtract(const Duration(hours: 5)),
          ),
          member('design', ada),
          member('design', linh),
        ],
        latestMessage: designMessages().last,
      ),
      ChatConversation(
        id: 'mira',
        wsId: 'ws-1',
        type: ChatConversationType.ai,
        updatedAt: today.subtract(const Duration(minutes: 40)),
        title: 'Mira',
        latestMessage: ChatMessage(
          id: 'mira-1',
          conversationId: 'mira',
          content: 'Your agenda for Thursday is drafted.',
          kind: ChatMessageKind.assistant,
          createdAt: today.subtract(const Duration(minutes: 40)),
        ),
      ),
      ChatConversation(
        id: 'general',
        wsId: 'ws-1',
        type: ChatConversationType.channel,
        updatedAt: today.subtract(const Duration(days: 2)),
        title: 'general',
        members: [member('general', me, pinnedAt: _today)],
        latestMessage: message(
          'g1',
          'general',
          'Office closes early on Friday.',
          sender: linh,
          at: today.subtract(const Duration(days: 2)),
        ),
      ),
      ChatConversation(
        id: 'ada-dm',
        wsId: 'ws-1',
        type: ChatConversationType.direct,
        updatedAt: today.subtract(const Duration(hours: 2)),
        members: [member('ada-dm', me), member('ada-dm', ada)],
        unreadCount: 1,
        latestMessage: message(
          'd1',
          'ada-dm',
          'Can you review the notes?',
          sender: ada,
          at: today.subtract(const Duration(hours: 2)),
        ),
      ),
    ];
  }
}

/// Serves [ChatFixtures] without the network.
class ChatFixtureRepository extends ChatRepository {
  ChatFixtureRepository(ChatFixtureApi api, {this.failConversations = false})
    : super(apiClient: api);

  final bool failConversations;

  @override
  Future<ChatConversationPage> listConversations(
    String wsId, {
    ChatArchivedFilter archived = ChatArchivedFilter.active,
    int limit = 40,
    int offset = 0,
    bool forceRefresh = false,
  }) async {
    if (failConversations) {
      throw const ApiException(message: 'Network unavailable', statusCode: 0);
    }
    return ChatConversationPage(conversations: ChatFixtures.conversations());
  }

  @override
  Future<List<ChatMessage>> listMessages(
    String wsId,
    String conversationId, {
    String? before,
    int limit = 60,
    bool forceRefresh = false,
  }) async => conversationId == 'design' && before == null
      ? ChatFixtures.designMessages()
      : const [];

  @override
  Future<ChatConversation> markRead(
    String wsId,
    String conversationId, {
    String? messageId,
  }) async => ChatFixtures.conversations().firstWhere(
    (conversation) => conversation.id == conversationId,
  );
}
