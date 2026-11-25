part of 'chat_cubit.dart';

/// Returns [reactions] with [userId]'s [emoji] reaction toggled.
List<ChatReactionSummary> toggledReactions(
  List<ChatReactionSummary> reactions,
  String emoji,
  String userId,
) {
  final next = <ChatReactionSummary>[];
  var found = false;
  for (final reaction in reactions) {
    if (reaction.emoji != emoji) {
      next.add(reaction);
      continue;
    }
    found = true;
    final reacted = reaction.userIds.contains(userId);
    final userIds = reacted
        ? reaction.userIds.where((id) => id != userId).toList(growable: false)
        : [...reaction.userIds, userId];
    final count = reacted ? reaction.count - 1 : reaction.count + 1;
    if (count > 0) {
      next.add(
        ChatReactionSummary(emoji: emoji, count: count, userIds: userIds),
      );
    }
  }
  if (!found) {
    next.add(ChatReactionSummary(emoji: emoji, count: 1, userIds: [userId]));
  }
  return next;
}

extension ChatCubitThreadActions on ChatCubit {
  void startReply(ChatMessage message) {
    if (message.deletedAt != null ||
        message.conversationId != state.selectedConversationId) {
      return;
    }
    _emitState(state.copyWith(replyToMessageId: message.id));
  }

  void cancelReply() => _emitState(state.copyWith(replyToMessageId: null));

  Future<void> deleteMessage(ChatMessage message) async {
    if (!_scopeActive) return;
    final wsId = state.wsId;
    if (wsId == null || message.deletedAt != null) return;
    try {
      final deleted = await _repository.deleteMessage(
        wsId,
        message.conversationId,
        message.id,
      );
      _patchMessage(
        deleted.copyWith(deletedAt: deleted.deletedAt ?? DateTime.now()),
      );
      if (state.replyToMessageId == message.id) cancelReply();
    } on ApiException catch (error) {
      _emitState(state.copyWith(error: error.message));
    }
  }

  /// Loads the page before the oldest loaded message of the open thread.
  Future<void> loadOlderMessages() async {
    if (!_scopeActive || state.isLoadingOlderMessages) return;
    final wsId = state.wsId;
    final conversationId = state.selectedConversationId;
    if (wsId == null ||
        conversationId == null ||
        !state.selectedHasOlderMessages) {
      return;
    }
    final oldest = state.selectedMessages
        .map((message) => message.createdAt)
        .whereType<DateTime>()
        .fold<DateTime?>(
          null,
          (oldest, at) => oldest == null || at.isBefore(oldest) ? at : oldest,
        );
    if (oldest == null) return;
    final token = _loadToken;
    _emitState(state.copyWith(isLoadingOlderMessages: true));
    try {
      final page = await _repository.listMessages(
        wsId,
        conversationId,
        before: oldest.toUtc().toIso8601String(),
      );
      if (!_scopeActive || token != _loadToken || state.wsId != wsId) return;
      final known = {
        for (final message
            in state.messages[conversationId] ?? const <ChatMessage>[])
          message.id,
      };
      final merged =
          [
            ...page.where((message) => !known.contains(message.id)),
            ...?state.messages[conversationId],
          ]..sort(
            (left, right) => (left.createdAt ?? DateTime(0)).compareTo(
              right.createdAt ?? DateTime(0),
            ),
          );
      _emitState(
        state.copyWith(
          isLoadingOlderMessages: false,
          messages: {...state.messages, conversationId: merged},
          hasOlderMessages: {
            ...state.hasOlderMessages,
            conversationId: page.length >= ChatCubit.messagePageSize,
          },
        ),
      );
    } on ApiException catch (error) {
      _emitState(
        state.copyWith(isLoadingOlderMessages: false, error: error.message),
      );
    }
  }

  ChatMessage? _findMessage(String conversationId, String messageId) {
    for (final message
        in state.messages[conversationId] ?? const <ChatMessage>[]) {
      if (message.id == messageId) return message;
    }
    return null;
  }

  /// Applies reaction, edit and deletion changes to a loaded message without
  /// treating it as new activity in the conversation list.
  void _patchMessage(ChatMessage patch) {
    final existing = _findMessage(patch.conversationId, patch.id);
    if (existing == null) return;
    final deleted = patch.deletedAt != null;
    final merged = existing.copyWith(
      content: deleted
          ? ''
          : (patch.content.isEmpty ? existing.content : patch.content),
      reactions: patch.reactions,
      editedAt: patch.editedAt,
      deletedAt: patch.deletedAt,
    );
    final list = state.messages[patch.conversationId]!
        .map((message) => message.id == patch.id ? merged : message)
        .toList(growable: false);
    _emitState(
      state.copyWith(
        messages: {...state.messages, patch.conversationId: list},
        conversations: state.conversations
            .map(
              (conversation) => conversation.latestMessage?.id == patch.id
                  ? conversation.copyWith(latestMessage: merged)
                  : conversation,
            )
            .toList(growable: false),
      ),
    );
  }

  void _clearUnread(String conversationId) {
    if (!state.conversations.any(
      (conversation) =>
          conversation.id == conversationId && conversation.unreadCount > 0,
    )) {
      return;
    }
    _emitState(
      state.copyWith(
        conversations: state.conversations
            .map(
              (conversation) => conversation.id == conversationId
                  ? conversation.copyWith(unreadCount: 0)
                  : conversation,
            )
            .toList(growable: false),
      ),
    );
  }
}
