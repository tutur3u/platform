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
}
