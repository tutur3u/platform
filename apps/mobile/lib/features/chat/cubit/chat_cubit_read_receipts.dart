part of 'chat_cubit.dart';

/// Keeps member read cursors current from the room's `read.updated` events,
/// so seen-by reflects them without refetching the conversation.
extension ChatCubitReadReceipts on ChatCubit {
  void _applyReadCursor(ChatRealtimeReadEvent event) {
    final index = state.conversations.indexWhere(
      (item) => item.id == event.conversationId,
    );
    if (index < 0) return;
    final conversation = state.conversations[index];
    final members = [...conversation.members];
    final at = members.indexWhere((member) => member.userId == event.userId);
    // Read cursors only move forward; a late or replayed event cannot unsee.
    final current = at < 0 ? null : members[at].lastReadAt;
    if (at < 0 || (current != null && !current.isBefore(event.lastReadAt))) {
      return;
    }
    members[at] = members[at].withLastReadAt(event.lastReadAt);
    final next = [...state.conversations]
      ..[index] = conversation.copyWith(members: members);
    emit(state.copyWith(conversations: next));
  }

  /// [incoming] with each member's read cursor at the later of its own and
  /// [current]'s: a conversation payload built before a `read.updated`
  /// event arrived must not move a cursor back.
  ChatConversation _keepLatestReadCursors(
    ChatConversation current,
    ChatConversation incoming,
  ) {
    final known = {
      for (final member in current.members)
        if (member.lastReadAt != null) member.userId: member.lastReadAt!,
    };
    if (known.isEmpty) return incoming;
    var changed = false;
    final members = [...incoming.members];
    for (var index = 0; index < members.length; index++) {
      final member = members[index];
      final at = known[member.userId];
      final read = member.lastReadAt;
      if (at != null && (read == null || read.isBefore(at))) {
        members[index] = member.withLastReadAt(at);
        changed = true;
      }
    }
    return changed ? incoming.copyWith(members: members) : incoming;
  }
}
