part of 'chat_cubit.dart';

/// Keeps local rows of queued sends in step with the server: once a queued
/// send replays, the open thread refetches quietly and the server copy
/// (matched by client request id) replaces the local row, so replies,
/// reactions and deletion always target a server id.
extension ChatCubitSync on ChatCubit {
  /// Whether [messageId] is on the server and can take replies, reactions
  /// and deletion.
  bool isMessageSynced(String messageId) {
    final wsId = state.wsId;
    return !_unsyncedIds.contains(messageId) &&
        (wsId == null || !isPendingChatMessage(wsId, messageId));
  }

  void _trackUnsynced(String wsId, Iterable<ChatMessage> messages) {
    for (final message in messages) {
      if (isPendingChatMessage(wsId, message.id)) {
        _unsyncedIds.add(message.id);
      }
    }
  }

  bool _isReplayOf({required ChatMessage local, required ChatMessage server}) {
    final requestId = local.clientRequestId;
    return local.id != server.id &&
        requestId != null &&
        requestId == server.clientRequestId &&
        _unsyncedIds.contains(local.id);
  }

  /// Drops local rows whose server copy is also in [messages].
  List<ChatMessage> _withoutReplayedDuplicates(List<ChatMessage> messages) {
    final served = {
      for (final message in messages)
        if (!_unsyncedIds.contains(message.id) &&
            message.clientRequestId != null)
          message.clientRequestId,
    };
    if (served.isEmpty) return messages;
    final kept = <ChatMessage>[];
    for (final message in messages) {
      if (_unsyncedIds.contains(message.id) &&
          served.contains(message.clientRequestId)) {
        _unsyncedIds.remove(message.id);
      } else {
        kept.add(message);
      }
    }
    return kept;
  }

  void _onQueueChanged() {
    final wsId = state.wsId;
    final selectedId = state.selectedConversationId;
    if (!_scopeActive || wsId == null || selectedId == null) return;
    final replayed = state.selectedMessages.any(
      (message) =>
          _unsyncedIds.contains(message.id) &&
          !isPendingChatMessage(wsId, message.id),
    );
    if (replayed) {
      unawaited(
        selectConversation(selectedId, forceRefresh: true, quietly: true),
      );
    }
  }
}
