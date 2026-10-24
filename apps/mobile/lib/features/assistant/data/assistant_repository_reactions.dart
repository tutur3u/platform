part of 'assistant_repository.dart';

extension AssistantReactionOperations on AssistantRepository {
  Future<bool> beginMessageReaction({
    required String wsId,
    required String chatId,
    required String messageId,
    required bool Function() isCurrent,
  }) {
    final current = _reactionLease(wsId, chatId, messageId, isCurrent);
    return _reactionJournal.begin(
      AssistantReactionJournal.keyFor(currentActorId!, wsId, chatId, messageId),
      isCurrent: current,
    );
  }

  Future<bool> confirmMessageReaction({
    required String wsId,
    required String chatId,
    required String messageId,
    required bool Function() isCurrent,
  }) {
    final current = _reactionLease(wsId, chatId, messageId, isCurrent);
    return _reactionJournal.confirm(
      AssistantReactionJournal.keyFor(currentActorId!, wsId, chatId, messageId),
      isCurrent: current,
    );
  }

  /// The actor is captured from authentication, never accepted in the body.
  /// This toggle must never enter the offline queue or a retrying transport.
  Future<ChatMessage> toggleMessageReaction({
    required String wsId,
    required String chatId,
    required String messageId,
    required String emoji,
    required bool Function() isCurrent,
  }) async {
    final current = _reactionLease(wsId, chatId, messageId, isCurrent);
    final actor = currentActorId!;
    if (emoji.trim().isEmpty) {
      throw const FormatException('Empty reaction');
    }
    final response = await _apiClient.postJsonAcknowledged(
      '/api/v1/workspaces/$wsId/chat/conversations/$chatId/reactions',
      {'messageId': messageId, 'emoji': emoji},
      actorId: actor,
      isCurrent: current,
    );
    if (!current()) throw const AssistantChatCacheCancellation();
    return _reactionReceipt(response['message'], chatId, messageId);
  }

  /// Reconcile an uncertain toggle with a fresh read; never repeat the toggle.
  Future<ChatMessage> refreshMessageReactions({
    required String wsId,
    required String chatId,
    required String messageId,
    required bool Function() isCurrent,
  }) async {
    final current = _reactionLease(wsId, chatId, messageId, isCurrent);
    final response = await _apiClient.getJson(
      '/api/v1/workspaces/$wsId/chat/conversations/$chatId/messages?limit=100',
    );
    if (!current()) throw const AssistantChatCacheCancellation();
    final rows = response['messages'];
    if (rows is! List) {
      throw const FormatException('Invalid reaction refresh receipt');
    }
    final matching = rows.whereType<Map<String, dynamic>>().where(
      (row) => row['id'] == messageId,
    );
    if (matching.length != 1) {
      // A missing/older target cannot establish the outcome. Keep the fence.
      throw const FormatException('Reaction target was not refreshed');
    }
    return _reactionReceipt(matching.single, chatId, messageId);
  }

  bool Function() _reactionLease(
    String wsId,
    String chatId,
    String messageId,
    bool Function() isCurrent,
  ) {
    final route = AssistantChatRoute.parse(chatId);
    final actor = currentActorId;
    if (route.kind != AssistantChatRouteKind.native ||
        !isUuid(wsId) ||
        !isUuid(messageId) ||
        actor == null ||
        actor.isEmpty) {
      throw const FormatException('Native reaction scope is unavailable');
    }
    final version = _creationGenerationVersion;
    var retired = false;
    bool current() {
      retired =
          retired ||
          currentActorId != actor ||
          version != _creationGenerationVersion ||
          !isCurrent();
      return !retired;
    }

    if (!current()) throw const AssistantChatCacheCancellation();
    return current;
  }
}

ChatMessage _reactionReceipt(Object? raw, String chatId, String messageId) {
  if (raw is! Map<String, dynamic> || raw['reactions'] is! List) {
    throw const FormatException('Invalid reaction receipt');
  }
  for (final summary in raw['reactions'] as List) {
    if (summary is! Map<String, dynamic> ||
        summary['emoji'] is! String ||
        (summary['emoji'] as String).trim().isEmpty ||
        summary['count'] is! int ||
        (summary['count'] as int) < 0) {
      throw const FormatException('Invalid reaction summary');
    }
    final users = summary['userIds'] ?? summary['user_ids'];
    if (users is! List || users.any((id) => id is! String || id.isEmpty)) {
      throw const FormatException('Invalid reaction actors');
    }
  }
  final message = ChatMessage.fromJson(raw);
  requireAssistantMessageReceipts([message], conversationId: chatId);
  if (message.id != messageId) {
    throw const FormatException('Reaction receipt target differs');
  }
  return message;
}
