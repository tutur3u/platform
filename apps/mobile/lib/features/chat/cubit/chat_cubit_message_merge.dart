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
  /// rows already replaced by their server copy, oldest first, with the
  /// viewer's in-flight reaction taps applied over fetched reactions.
  List<ChatMessage> _sortedById(List<ChatMessage> messages) =>
      _withoutReplayedDuplicates(
        <String, ChatMessage>{
          for (final message in messages)
            message.id:
                _latestReactionOps.keys.any((key) => key.$1 == message.id)
                ? message.copyWith(
                    reactions: _withPendingReactions(
                      message.id,
                      message.reactions,
                    ),
                  )
                : message,
        }.values.toList(),
      )..sort(
        (left, right) => (left.createdAt ?? DateTime(0)).compareTo(
          right.createdAt ?? DateTime(0),
        ),
      );

  /// Folds a fetched newest page into the loaded thread.
  ///
  /// Overlap is judged only against rows earlier fetches returned (the
  /// conversation's fetched range), never against rows realtime or a live
  /// send appended: those can share an id with a page that skipped a long
  /// run of messages. A quiet refresh whose full page overlaps keeps the
  /// messages at or before its start, so older pages, the history cursor
  /// and the reading position survive. Any other page replaces the fetched
  /// rows, because keeping them would leave a gap the cursor never fills.
  /// Appended rows newer than the page, such as a realtime message that
  /// arrived during the fetch, are kept either way.
  ({List<ChatMessage> messages, bool hasOlder}) _mergeFetchedPage(
    String conversationId,
    ChatMessagePage page, {
    required bool quietly,
  }) {
    final full = page.serverCount >= ChatCubit.messagePageSize;
    final fetched = _fetched[conversationId];
    final synced = (state.messages[conversationId] ?? const <ChatMessage>[])
        .where((message) => isMessageSynced(message.id))
        .toList(growable: false);
    final pageStart = _syncedBound(page.messages, newest: false);
    final pageEnd = _syncedBound(page.messages, newest: true);
    final pageIds = {for (final message in page.messages) message.id};
    // The range only ever holds synced ids: a queued send overlaid on two
    // pages must not make them look contiguous.
    final syncedPageIds = {
      for (final message in page.messages)
        if (isMessageSynced(message.id)) message.id,
    };
    final fetchedEnd = fetched?.end;
    final overlaps =
        quietly &&
        full &&
        pageStart != null &&
        fetched != null &&
        (syncedPageIds.any(fetched.ids.contains) ||
            (fetchedEnd != null && !pageStart.isAfter(fetchedEnd)));
    final newer = pageEnd == null
        ? const <ChatMessage>[]
        : synced
              .where(
                (message) =>
                    !(fetched?.ids.contains(message.id) ?? false) &&
                    !pageIds.contains(message.id) &&
                    (message.createdAt?.isAfter(pageEnd) ?? false),
              )
              .toList(growable: false);
    final older = overlaps
        ? synced
              .where(
                (message) =>
                    !pageIds.contains(message.id) &&
                    !(message.createdAt?.isAfter(pageStart) ?? true),
              )
              .toList(growable: false)
        : const <ChatMessage>[];
    if (overlaps) {
      _fetched[conversationId] = (
        end: fetchedEnd == null || (pageEnd?.isAfter(fetchedEnd) ?? false)
            ? pageEnd ?? fetchedEnd
            : fetchedEnd,
        ids: {...fetched.ids, ...syncedPageIds},
      );
    } else {
      _fetched[conversationId] = (end: pageEnd, ids: syncedPageIds);
      _rangeGeneration[conversationId] =
          (_rangeGeneration[conversationId] ?? 0) + 1;
    }
    return (
      messages: _sortedById([...older, ...page.messages, ...newer]),
      hasOlder: older.isEmpty
          ? full
          : state.hasOlderMessages[conversationId] ?? full,
    );
  }

  /// Records an older history page as fetched without moving the range end.
  void _recordOlderPage(String conversationId, ChatMessagePage page) {
    final fetched = _fetched[conversationId];
    _fetched[conversationId] = (
      end: fetched?.end ?? _syncedBound(page.messages, newest: true),
      ids: {
        ...?fetched?.ids,
        for (final message in page.messages)
          if (isMessageSynced(message.id)) message.id,
      },
    );
  }

  /// Drops fetched ranges (one conversation's, or all on a workspace
  /// switch) and bumps their generations so in-flight history pages are
  /// discarded.
  void _forgetFetchedRanges([String? conversationId]) {
    final ids = conversationId == null
        ? {..._fetched.keys, ..._rangeGeneration.keys}
        : {conversationId};
    for (final id in ids) {
      _fetched.remove(id);
      _freshFetchedAt.remove(id);
      _rangeGeneration[id] = (_rangeGeneration[id] ?? 0) + 1;
    }
  }

  /// A plain selection may show a cached page; revalidate it in the
  /// background through the overlap-or-replace merge. Skipped when the
  /// thread was fetched from the server moments ago, so repeated taps do
  /// not refetch.
  void _revalidateThread(String conversationId) {
    final last = _freshFetchedAt[conversationId];
    if (last != null && _now().difference(last) < ChatCubit.revalidateAfter) {
      return;
    }
    unawaited(
      selectConversation(
        conversationId,
        forceRefresh: true,
        fresh: true,
        quietly: true,
      ).catchError((Object _) {}),
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
