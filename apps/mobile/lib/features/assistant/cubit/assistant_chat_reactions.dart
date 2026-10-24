part of 'assistant_chat_cubit.dart';

enum AssistantReactionResult {
  updated,
  unavailable,
  busy,
  refreshRequired,
  unknown,
  stale,
}

extension AssistantChatPersistenceActions on AssistantChatCubit {
  bool get replyBlockedByPendingSubmission =>
      state.replyTarget != null &&
      _nativePendingFor(state.workspaceId ?? '') != null;

  /// Local UUIDs and legacy Mira rows never qualify for private Chat FKs.
  bool canPersistMessage(String messageId) {
    final chatId = state.storedChatId;
    if (_closing ||
        isClosed ||
        state.status == AssistantChatStatus.restoring ||
        state.workspaceId == null ||
        _repository.currentActorId == null ||
        _repository.currentActorId != _messageActorId ||
        chatId == null ||
        state.chat?.id != chatId) {
      return false;
    }
    try {
      return AssistantChatRoute.parse(chatId).kind ==
              AssistantChatRouteKind.native &&
          isUuid(state.workspaceId!) &&
          isUuid(messageId) &&
          state.messages.any((m) => m.id == messageId && m.isPersisted);
    } on FormatException {
      return false;
    }
  }

  bool setReplyTarget(String messageId) {
    if (!canPersistMessage(messageId)) return false;
    _emitIfOpen(
      state.copyWith(
        replyTarget: state.messages.firstWhere((m) => m.id == messageId),
      ),
    );
    return true;
  }

  void clearReplyTarget() => _emitIfOpen(state.copyWith(replyTarget: null));

  bool needsReactionRefresh(String messageId) {
    final key = (
      _repository.currentActorId ?? '',
      state.workspaceId ?? '',
      state.storedChatId ?? '',
      messageId,
    );
    return _uncertainReactions.contains(key) ||
        (state.messages
                .where((m) => m.id == messageId)
                .firstOrNull
                ?.reactionRefreshRequired ??
            false);
  }

  Future<AssistantReactionResult> toggleReaction(
    String messageId,
    String emoji, {
    bool Function()? isCurrent,
  }) => _changeReactions(messageId, emoji: emoji, isCurrent: isCurrent);

  Future<AssistantReactionResult> refreshReactions(
    String messageId, {
    bool Function()? isCurrent,
  }) => _changeReactions(messageId, isCurrent: isCurrent);

  Future<AssistantReactionResult> _changeReactions(
    String messageId, {
    String? emoji,
    bool Function()? isCurrent,
  }) async {
    if (!canPersistMessage(messageId) ||
        (emoji != null && emoji.trim().isEmpty)) {
      return AssistantReactionResult.unavailable;
    }
    final key = (
      _repository.currentActorId!,
      state.workspaceId!,
      state.storedChatId!,
      messageId,
    );
    if (_reactionOperations.containsKey(key)) {
      return AssistantReactionResult.busy;
    }
    if (emoji != null && needsReactionRefresh(messageId)) {
      _emitIfOpen(
        state.copyWith(reactionResult: AssistantReactionResult.refreshRequired),
      );
      return AssistantReactionResult.refreshRequired;
    }
    final version = _workspaceVersion;
    final operation = Object();
    _reactionOperations[key] = operation;
    var retired = false;
    bool current() {
      retired =
          retired ||
          _closing ||
          isClosed ||
          version != _workspaceVersion ||
          _repository.currentActorId != key.$1 ||
          state.workspaceId != key.$2 ||
          state.storedChatId != key.$3 ||
          !state.messages.any((m) => m.id == messageId && m.isPersisted) ||
          !identical(_reactionOperations[key], operation);
      retired = retired || !(isCurrent?.call() ?? true);
      return !retired;
    }

    _emitIfOpen(state.copyWith(reactionResult: null));
    try {
      if (emoji != null) {
        _uncertainReactions.add(key);
        _patchReactionSummary(messageId, refreshRequired: true);
        final recorded = await _repository.beginMessageReaction(
          wsId: key.$2,
          chatId: key.$3,
          messageId: messageId,
          isCurrent: current,
        );
        if (!current()) return AssistantReactionResult.stale;
        if (!recorded) {
          _emitIfOpen(
            state.copyWith(
              reactionResult: AssistantReactionResult.refreshRequired,
            ),
          );
          return AssistantReactionResult.refreshRequired;
        }
        _persistAssistantChatCache();
      }
      final ChatMessage receipt;
      if (emoji == null) {
        receipt = await _repository.refreshMessageReactions(
          wsId: key.$2,
          chatId: key.$3,
          messageId: messageId,
          isCurrent: current,
        );
      } else {
        receipt = await _repository.toggleMessageReaction(
          wsId: key.$2,
          chatId: key.$3,
          messageId: messageId,
          emoji: emoji,
          isCurrent: current,
        );
      }
      if (!current()) return AssistantReactionResult.stale;
      if (emoji == null) {
        final held = needsReactionRefresh(messageId);
        _patchReactionSummary(
          messageId,
          reactions: receipt.reactions,
          refreshRequired: held,
        );
        final result = held
            ? AssistantReactionResult.unknown
            : AssistantReactionResult.updated;
        _emitIfOpen(state.copyWith(reactionResult: result));
        _persistAssistantChatCache();
        return result;
      }
      final confirmed = await _repository.confirmMessageReaction(
        wsId: key.$2,
        chatId: key.$3,
        messageId: messageId,
        isCurrent: current,
      );
      if (!current()) return AssistantReactionResult.stale;
      if (confirmed) _uncertainReactions.remove(key);
      _patchReactionSummary(
        messageId,
        reactions: receipt.reactions,
        refreshRequired: !confirmed,
      );
      final result = confirmed
          ? AssistantReactionResult.updated
          : AssistantReactionResult.refreshRequired;
      _emitIfOpen(state.copyWith(reactionResult: result));
      _persistAssistantChatCache();
      return result;
    } on AssistantChatCacheCancellation {
      return AssistantReactionResult.stale;
    } on Object {
      if (!current()) return AssistantReactionResult.stale;
      final result = emoji == null
          ? AssistantReactionResult.refreshRequired
          : AssistantReactionResult.unknown;
      _emitIfOpen(state.copyWith(reactionResult: result));
      _persistAssistantChatCache();
      return result;
    } finally {
      if (identical(_reactionOperations[key], operation)) {
        _reactionOperations.remove(key);
      }
    }
  }

  void _patchReactionSummary(
    String messageId, {
    required bool refreshRequired,
    List<ChatReactionSummary>? reactions,
  }) {
    _emitIfOpen(
      state.copyWith(
        messages: state.messages
            .map(
              (message) => message.id == messageId
                  ? message.copyWith(
                      reactions: reactions,
                      reactionRefreshRequired: refreshRequired,
                    )
                  : message,
            )
            .toList(growable: false),
      ),
    );
  }
}
