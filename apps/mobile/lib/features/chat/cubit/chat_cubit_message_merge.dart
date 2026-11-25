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

  DateTime? _oldestServerMessageAt(String wsId, String conversationId) =>
      _syncedBound(state.messages[conversationId] ?? const [], newest: false);

  /// Oldest (or [newest]) `createdAt` among synced [messages].
  DateTime? _syncedBound(List<ChatMessage> messages, {required bool newest}) {
    DateTime? bound;
    for (final message in messages) {
      final at = message.createdAt;
      if (at == null || !isMessageSynced(message.id)) continue;
      if (bound == null || (newest ? at.isAfter(bound) : at.isBefore(bound))) {
        bound = at;
      }
    }
    return bound;
  }

  /// [messages] without duplicate ids (the last occurrence wins) or local
  /// rows already replaced by their server copy, oldest first.
  List<ChatMessage> _sortedById(List<ChatMessage> messages) =>
      _withoutReplayedDuplicates(
        <String, ChatMessage>{
          for (final message in messages) message.id: message,
        }.values.toList(),
      )..sort(
        (left, right) => (left.createdAt ?? DateTime(0)).compareTo(
          right.createdAt ?? DateTime(0),
        ),
      );

  /// Folds a freshly fetched newest page into the loaded thread.
  ///
  /// When the page overlaps the loaded messages (it shares a synced id or
  /// starts at or before the newest loaded one), messages at or before its
  /// start stay, so older pages, the history cursor and the scroll position
  /// survive. A page that does not overlap replaces the thread: keeping the
  /// old messages would leave a gap the history cursor could never fill.
  /// Loaded messages newer than the page, such as a realtime message that
  /// arrived during the fetch, are kept either way.
  ({List<ChatMessage> messages, bool hasOlder}) _mergeNewestPage(
    String wsId,
    String conversationId,
    ChatMessagePage page,
  ) {
    final full = page.serverCount >= ChatCubit.messagePageSize;
    final existing = state.messages[conversationId];
    if (existing == null) {
      return (messages: _sortedById(page.messages), hasOlder: full);
    }
    final synced = existing
        .where((message) => isMessageSynced(message.id))
        .toList(growable: false);
    final pageStart = _syncedBound(page.messages, newest: false);
    final pageEnd = _syncedBound(page.messages, newest: true);
    final loadedEnd = _syncedBound(synced, newest: true);
    final pageIds = {for (final message in page.messages) message.id};
    final overlaps =
        synced.any((message) => pageIds.contains(message.id)) ||
        (pageStart != null &&
            loadedEnd != null &&
            !pageStart.isAfter(loadedEnd));
    final newer = pageEnd == null
        ? const <ChatMessage>[]
        : synced
              .where((message) => message.createdAt?.isAfter(pageEnd) ?? false)
              .toList(growable: false);
    if (!full || !overlaps || pageStart == null) {
      return (
        messages: _sortedById([...page.messages, ...newer]),
        hasOlder: full,
      );
    }
    final older = synced
        .where(
          (message) =>
              !pageIds.contains(message.id) &&
              !(message.createdAt?.isAfter(pageStart) ?? true),
        )
        .toList(growable: false);
    return (
      messages: _sortedById([...older, ...page.messages, ...newer]),
      hasOlder: older.isEmpty
          ? full
          : state.hasOlderMessages[conversationId] ?? full,
    );
  }

  /// [reactions] with the viewer's in-flight reaction taps on [messageId]
  /// applied, so a server or realtime copy cannot briefly undo them.
  List<ChatReactionSummary> _withPendingReactions(
    String messageId,
    List<ChatReactionSummary> reactions,
  ) {
    final userId = _currentUserId();
    if (userId == null) return reactions;
    var next = reactions;
    for (final MapEntry(key: (id, emoji), value: op)
        in _latestReactionOps.entries) {
      if (id == messageId) {
        next = reactionsWith(next, emoji, userId, op.present);
      }
    }
    return next;
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
      reactions: _withPendingReactions(
        patch.id,
        replaceReactions || patch.reactions.isNotEmpty
            ? patch.reactions
            : existing.reactions,
      ),
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
