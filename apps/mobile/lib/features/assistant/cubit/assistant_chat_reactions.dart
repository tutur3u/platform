part of 'assistant_chat_cubit.dart';

enum AssistantReactionResult {
  updated,
  unavailable,
  busy,
  refreshRequired,
  unknown,
  stale,
}

class _AssistantReactionState {
  final operations = <(String, String, String, String), Object>{};
  final uncertain = <(String, String, String, String)>{};
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
    return _reactionState.uncertain.contains(key) ||
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
    final canonicalEmoji = emoji?.trim();
    if (!canPersistMessage(messageId) ||
        (canonicalEmoji != null && canonicalEmoji.isEmpty)) {
      return AssistantReactionResult.unavailable;
    }
    final key = (
      _repository.currentActorId!,
      state.workspaceId!,
      state.storedChatId!,
      messageId,
    );
    if (_reactionState.operations.containsKey(key)) {
      return AssistantReactionResult.busy;
    }
    if (canonicalEmoji != null && needsReactionRefresh(messageId)) {
      _emitIfOpen(
        state.copyWith(reactionResult: AssistantReactionResult.refreshRequired),
      );
      return AssistantReactionResult.refreshRequired;
    }
    final version = _workspaceVersion;
    final actorEpoch = _repository.reactionActorEpoch;
    final operation = Object();
    _reactionState.operations[key] = operation;
    var retired = false;
    bool current() {
      retired =
          retired ||
          _closing ||
          isClosed ||
          version != _workspaceVersion ||
          actorEpoch != _repository.reactionActorEpoch ||
          _repository.currentActorId != key.$1 ||
          state.workspaceId != key.$2 ||
          state.storedChatId != key.$3 ||
          !state.messages.any((m) => m.id == messageId && m.isPersisted) ||
          !identical(_reactionState.operations[key], operation);
      retired = retired || !(isCurrent?.call() ?? true);
      return !retired;
    }

    _emitIfOpen(state.copyWith(reactionResult: null));
    AssistantReactionIntent? intent;
    var recorded = false;
    Future<bool> cleanup() => _repository.confirmMessageReaction(
      actorId: key.$1,
      wsId: key.$2,
      chatId: key.$3,
      messageId: messageId,
      opId: intent!.opId,
    );
    try {
      await _repository.prepareMessageReactions(
        wsId: key.$2,
        isCurrent: current,
      );
      if (!current()) return AssistantReactionResult.stale;
      if (canonicalEmoji != null) {
        final row = state.messages.firstWhere((m) => m.id == messageId);
        intent = AssistantReactionIntent(
          opId: _repository.generateUuid(),
          emoji: canonicalEmoji,
          present: !row.reactions.any(
            (r) => r.emoji == canonicalEmoji && r.userIds.contains(key.$1),
          ),
        );
        final begin = await _repository.beginMessageReaction(
          wsId: key.$2,
          chatId: key.$3,
          messageId: messageId,
          intent: intent,
          isCurrent: current,
        );
        recorded = begin == AssistantReactionBegin.recorded;
        if (!current()) {
          if (recorded) await cleanup();
          return AssistantReactionResult.stale;
        }
        if (begin == AssistantReactionBegin.failed) {
          _emitIfOpen(
            state.copyWith(reactionResult: AssistantReactionResult.unavailable),
          );
          return AssistantReactionResult.unavailable;
        }
        if (begin == AssistantReactionBegin.alreadyPending) {
          _patchReactionSummary(messageId, refreshRequired: true);
          _emitIfOpen(
            state.copyWith(
              reactionResult: AssistantReactionResult.refreshRequired,
            ),
          );
          return AssistantReactionResult.refreshRequired;
        }
        _reactionState.uncertain.add(key);
        _patchReactionSummary(messageId, refreshRequired: true);
        _persistAssistantChatCache();
      } else {
        intent = await _repository.pendingMessageReaction(
          actorId: key.$1,
          wsId: key.$2,
          chatId: key.$3,
          messageId: messageId,
        );
        if (!current()) return AssistantReactionResult.stale;
      }
      var confirmed = true;
      if (intent != null) {
        final result = await _repository.setMessageReaction(
          actorId: key.$1,
          wsId: key.$2,
          chatId: key.$3,
          messageId: messageId,
          intent: intent,
          clearIfNotDispatched: recorded,
          isCurrent: current,
        );
        confirmed = result.confirmed;
        if (confirmed) _reactionState.uncertain.remove(key);
        if (!current()) return AssistantReactionResult.stale;
        if (canonicalEmoji != null) {
          _patchReactionSummary(
            messageId,
            reactions: result.message.reactions,
            refreshRequired: !confirmed,
          );
        }
      }
      if (canonicalEmoji == null) {
        final receipt = await _repository.refreshMessageReactions(
          wsId: key.$2,
          chatId: key.$3,
          messageId: messageId,
          isCurrent: current,
        );
        if (!current()) return AssistantReactionResult.stale;
        if (confirmed) _reactionState.uncertain.remove(key);
        _patchReactionSummary(
          messageId,
          reactions: receipt.reactions,
          refreshRequired: !confirmed,
        );
      }
      final result = confirmed
          ? AssistantReactionResult.updated
          : AssistantReactionResult.refreshRequired;
      _emitIfOpen(state.copyWith(reactionResult: result));
      _persistAssistantChatCache();
      return result;
    } on AssistantChatCacheCancellation {
      if (recorded && intent != null) {
        await cleanup();
        _reactionState.uncertain.remove(key);
      }
      return AssistantReactionResult.stale;
    } on Object catch (error) {
      final unsent = error is ApiMutationNotDispatched && recorded;
      if (unsent && intent != null) {
        await cleanup();
        _reactionState.uncertain.remove(key);
      }
      if (!current()) return AssistantReactionResult.stale;
      if (unsent) _patchReactionSummary(messageId, refreshRequired: false);
      final result = (unsent || (!recorded && canonicalEmoji != null))
          ? AssistantReactionResult.unavailable
          : canonicalEmoji == null
          ? AssistantReactionResult.refreshRequired
          : AssistantReactionResult.unknown;
      _emitIfOpen(state.copyWith(reactionResult: result));
      _persistAssistantChatCache();
      return result;
    } finally {
      if (identical(_reactionState.operations[key], operation)) {
        _reactionState.operations.remove(key);
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
