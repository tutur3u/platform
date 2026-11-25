part of 'chat_cubit.dart';

/// Returns [reactions] with [userId]'s [emoji] reaction set to [present].
List<ChatReactionSummary> reactionsWith(
  List<ChatReactionSummary> reactions,
  String emoji,
  String userId,
  bool present,
) {
  final next = <ChatReactionSummary>[];
  var found = false;
  for (final reaction in reactions) {
    if (reaction.emoji != emoji) {
      next.add(reaction);
      continue;
    }
    found = true;
    final has = reaction.userIds.contains(userId);
    if (has == present) {
      next.add(reaction);
      continue;
    }
    final userIds = present
        ? [...reaction.userIds, userId]
        : reaction.userIds.where((id) => id != userId).toList(growable: false);
    final count = reaction.count + (present ? 1 : -1);
    if (count > 0) {
      next.add(
        ChatReactionSummary(emoji: emoji, count: count, userIds: userIds),
      );
    }
  }
  if (!found && present) {
    next.add(ChatReactionSummary(emoji: emoji, count: 1, userIds: [userId]));
  }
  return next;
}

extension ChatCubitThreadActions on ChatCubit {
  void startReply(ChatMessage message) {
    if (message.deletedAt != null ||
        !isMessageSynced(message.id) ||
        message.conversationId != state.selectedConversationId) {
      return;
    }
    _emitState(state.copyWith(replyToMessageId: message.id));
  }

  void cancelReply() => _emitState(state.copyWith(replyToMessageId: null));

  /// Clears a reported action error so the same failure can report again.
  void dismissError() {
    if (state.error != null) _emitState(state.copyWith(clearError: true));
  }

  Future<void> deleteMessage(ChatMessage message) async {
    if (!_scopeActive) return;
    final wsId = state.wsId;
    if (wsId == null ||
        message.deletedAt != null ||
        !isMessageSynced(message.id)) {
      return;
    }
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

  /// Loads the page before the oldest loaded message of the open thread,
  /// using its `createdAt` as the `before` cursor as web does.
  Future<void> loadOlderMessages() async {
    if (!_scopeActive) return;
    final wsId = state.wsId;
    final conversationId = state.selectedConversationId;
    if (wsId == null ||
        conversationId == null ||
        state.loadingOlderConversationId == conversationId ||
        !state.selectedHasOlderMessages) {
      return;
    }
    final oldest = _oldestServerMessageAt(wsId, conversationId);
    if (oldest == null) return;
    final token = _loadToken;
    _emitState(state.copyWith(loadingOlderConversationId: conversationId));
    try {
      final page = await _repository.listMessagePage(
        wsId,
        conversationId,
        before: oldest.toUtc().toIso8601String(),
      );
      if (!_scopeActive || token != _loadToken || state.wsId != wsId) return;
      _trackUnsynced(wsId, page.messages);
      final merged = _sortedById([
        ...?state.messages[conversationId],
        ...page.messages,
      ]);
      _emitState(
        state.copyWith(
          messages: {...state.messages, conversationId: merged},
          hasOlderMessages: {
            ...state.hasOlderMessages,
            conversationId: page.serverCount >= ChatCubit.messagePageSize,
          },
        ),
      );
    } on ApiException catch (error) {
      _emitState(state.copyWith(error: error.message));
    } on Object catch (error) {
      _emitState(state.copyWith(error: error.toString()));
    } finally {
      if (state.loadingOlderConversationId == conversationId) {
        _emitState(state.copyWith(loadingOlderConversationId: null));
      }
    }
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
