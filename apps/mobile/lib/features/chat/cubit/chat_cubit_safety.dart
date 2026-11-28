part of 'chat_cubit.dart';

/// Blocking and reporting people from chat. The blocked set is kept here so
/// thread lists, search and realtime events can hide blocked senders.
extension ChatCubitSafety on ChatCubit {
  /// Loads the viewer's blocked people. A failure keeps the current set.
  Future<void> loadBlocks() async {
    if (!_scopeActive) return;
    final wsId = state.wsId;
    if (wsId == null) return;
    try {
      final blocks = await _repository.listBlocks(wsId);
      if (_scopeActive && state.wsId == wsId) {
        _emitState(state.copyWith(blockedUsers: blocks));
      }
    } on Object catch (error) {
      _failureNote(error, 'blocks load');
    }
  }

  /// Blocks [user]. Throws when the server refuses, so the sheet that asked
  /// can show the failure in place.
  Future<void> blockUser(ChatUserProfile user) async {
    final wsId = state.wsId;
    if (!_scopeActive || wsId == null) return;
    await _repository.blockUser(wsId, user.id);
    _applyBlocked(wsId, user);
  }

  /// Unblocks [userId]. Throws when the server refuses.
  Future<void> unblockUser(String userId) async {
    final wsId = state.wsId;
    if (!_scopeActive || wsId == null) return;
    await _repository.unblockUser(wsId, userId);
    if (!_scopeActive || state.wsId != wsId) return;
    // A direct thread with them may be sent to again; a refusal from their
    // side marks it blocked on the next send.
    final directIds = {
      for (final conversation in state.conversations)
        if (conversation.type == ChatConversationType.direct &&
            conversation.members.any((member) => member.userId == userId))
          conversation.id,
    };
    _emitState(
      state.copyWith(
        blockedUsers: state.blockedUsers
            .where((block) => block.userId != userId)
            .toList(growable: false),
        blockedConversationIds: state.blockedConversationIds.difference(
          directIds,
        ),
      ),
    );
  }

  /// Files [draft] about [subject]. Throws when the server refuses; when
  /// the server also blocked the person, the blocked set gains them.
  Future<ChatReportReceipt> submitReport(
    ChatReportDraft draft, {
    required ChatUserProfile subject,
  }) async {
    final wsId = state.wsId;
    if (!_scopeActive || wsId == null) {
      throw const ApiException(message: 'Workspace unavailable', statusCode: 0);
    }
    final receipt = await _repository.submitReport(wsId, draft);
    if (receipt.blocked || draft.alsoBlock) _applyBlocked(wsId, subject);
    return receipt;
  }

  void _applyBlocked(String wsId, ChatUserProfile user) {
    if (!_scopeActive || state.wsId != wsId) return;
    final blocked = [
      ...state.blockedUsers.where((block) => block.userId != user.id),
      ChatBlockedUser.fromProfile(user),
    ];
    _emitState(
      state.copyWith(
        blockedUsers: blocked,
        replyToMessageId:
            state.replyToMessage != null &&
                state.isFromBlockedSender(state.replyToMessage!, {user.id})
            ? null
            : state.replyToMessageId,
      ),
    );
    // Blocking also ends friendship and pending requests on the server.
    unawaited(loadFriendRequests());
  }

  /// Whether a realtime message should be dropped because its sender is
  /// blocked; the server does not filter realtime events.
  bool _isFromBlockedSender(ChatMessage message) =>
      state.isFromBlockedSender(message);

  /// Records that the server refused a send in [conversationId] because
  /// either side blocked the other.
  void _markConversationBlocked(String conversationId) {
    if (!_scopeActive) return;
    _emitState(
      state.copyWith(
        isSending: false,
        streamingAssistantText: '',
        blockedConversationIds: {
          ...state.blockedConversationIds,
          conversationId,
        },
      ),
    );
  }
}
