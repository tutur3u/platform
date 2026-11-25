part of 'chat_cubit.dart';

/// Whether [messageId] is a send still waiting in the offline queue. Queued
/// sends carry UUID ids too, so the id alone cannot tell them apart from
/// synced messages; a queued reaction or delete does not make a synced
/// message pending.
bool isPendingChatMessage(String wsId, String messageId) =>
    OfflineMutationQueue.instance.pending.value.any(
      (record) =>
          record.feature == 'chat' &&
          record.workspaceId == wsId &&
          record.entityId == messageId &&
          record.method == 'POST' &&
          record.path.endsWith('/messages'),
    );

extension ChatCubitMessageMerge on ChatCubit {
  ChatMessage? _findMessage(String conversationId, String messageId) {
    for (final message
        in state.messages[conversationId] ?? const <ChatMessage>[]) {
      if (message.id == messageId) return message;
    }
    return null;
  }

  /// A history page is full when it holds [ChatCubit.messagePageSize]
  /// synced messages; queued sends overlaid on the page do not count.
  bool _isFullPage(String wsId, List<ChatMessage> page) =>
      page.where((message) => !isPendingChatMessage(wsId, message.id)).length >=
      ChatCubit.messagePageSize;

  DateTime? _oldestServerMessageAt(String wsId, String conversationId) {
    DateTime? oldest;
    for (final message
        in state.messages[conversationId] ?? const <ChatMessage>[]) {
      final at = message.createdAt;
      if (at == null || isPendingChatMessage(wsId, message.id)) continue;
      if (oldest == null || at.isBefore(oldest)) oldest = at;
    }
    return oldest;
  }

  /// [messages] without duplicate ids (the last occurrence wins), oldest
  /// first.
  List<ChatMessage> _sortedById(List<ChatMessage> messages) =>
      <String, ChatMessage>{
        for (final message in messages) message.id: message,
      }.values.toList()..sort(
        (left, right) => (left.createdAt ?? DateTime(0)).compareTo(
          right.createdAt ?? DateTime(0),
        ),
      );

  /// Folds a freshly fetched newest page into the loaded thread. Messages
  /// older than the page stay, so a quiet refresh keeps older history, the
  /// `before` cursor and the scroll position; within the page's span the
  /// server copy wins and rows it no longer returns are dropped.
  ({List<ChatMessage> messages, bool hasOlder}) _mergeNewestPage(
    String wsId,
    String conversationId,
    List<ChatMessage> page,
  ) {
    final existing = state.messages[conversationId];
    final full = _isFullPage(wsId, page);
    if (existing == null || !full) return (messages: page, hasOlder: full);
    DateTime? pageStart;
    for (final message in page) {
      final at = message.createdAt;
      if (at == null || isPendingChatMessage(wsId, message.id)) continue;
      if (pageStart == null || at.isBefore(pageStart)) pageStart = at;
    }
    if (pageStart == null) return (messages: page, hasOlder: full);
    final older = existing
        .where((message) => message.createdAt?.isBefore(pageStart!) ?? false)
        .toList(growable: false);
    return (
      messages: _sortedById([...older, ...page]),
      hasOlder: older.isEmpty
          ? full
          : state.hasOlderMessages[conversationId] ?? full,
    );
  }

  /// Applies an edit, deletion or reaction change to a loaded message without
  /// treating it as new activity: unloaded messages are ignored and the
  /// conversation's latest message and order stay put. [replaceReactions] is
  /// false for payloads that may omit reactions, such as edits.
  void _patchMessage(ChatMessage patch, {bool replaceReactions = true}) {
    final existing = _findMessage(patch.conversationId, patch.id);
    if (existing == null) return;
    final deleted = patch.deletedAt != null;
    final merged = existing.copyWith(
      content: deleted
          ? ''
          : (patch.content.isEmpty ? existing.content : patch.content),
      reactions: replaceReactions || patch.reactions.isNotEmpty
          ? patch.reactions
          : existing.reactions,
      metadata: patch.metadata.isEmpty ? null : patch.metadata,
      editedAt: patch.editedAt,
      deletedAt: patch.deletedAt,
    );
    final list = state.messages[patch.conversationId]!
        .map((message) => message.id == patch.id ? merged : message)
        .toList(growable: false);
    _emitState(
      state.copyWith(
        messages: {...state.messages, patch.conversationId: list},
        replyToMessageId: deleted && state.replyToMessageId == patch.id
            ? null
            : state.replyToMessageId,
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
}
