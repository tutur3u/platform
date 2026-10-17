part of 'assistant_chat_cubit.dart';

extension _AssistantChatRestore on AssistantChatCubit {
  Future<void> _loadWorkspace(String wsId) async {
    _repository.invalidateChatCreation();
    final workspaceVersion = ++_workspaceVersion;
    final actor = _repository.currentActorId;
    bool current() =>
        !isClosed &&
        workspaceVersion == _workspaceVersion &&
        _repository.currentActorId == actor;
    final preserveState = state.workspaceId == wsId && state.hasLoadedOnce;
    await _streamSubscription?.cancel();
    if (!current()) return;
    _queueDebounce?.cancel();
    _queue.clear();
    _activeAssistantMessageId = null;
    _activeTextBlockId = null;
    _activeReasoningBlockId = null;

    if (preserveState) {
      _emitIfOpen(
        state.copyWith(
          workspaceId: wsId,
          fallbackChatId: _repository.generateUuid(),
          composerAttachments: const [],
          queuedMessages: const [],
          status: AssistantChatStatus.restoring,
          clearError: true,
        ),
      );
    } else {
      _emitIfOpen(
        AssistantChatState(
          workspaceId: wsId,
          fallbackChatId: _repository.generateUuid(),
          status: AssistantChatStatus.restoring,
        ),
      );
    }

    try {
      unawaited(_refreshHistoryFor(wsId, workspaceVersion));
      bool unknown;
      try {
        unknown = await _repository.hasUnknownChatCreation(wsId);
      } on Object {
        unknown = true;
      }
      if (!current()) return;
      _emitIfOpen(state.copyWith(creationOutcomeUnknown: unknown));
      final storedChatId = await _preferences.loadChatId(wsId);
      if (!current()) return;

      if (storedChatId == null) {
        if (!current()) return;
        _emitIfOpen(
          state.copyWith(
            status: AssistantChatStatus.idle,
            hasLoadedOnce: true,
            storedChatId: null,
          ),
        );
        await _onChatRestored(null);
        return;
      }

      // A restore failure retains the selected identity. It is not a new chat.
      _emitIfOpen(state.copyWith(storedChatId: storedChatId));
      final restored = await _repository.restoreChat(
        wsId: wsId,
        chatId: storedChatId,
        cacheOrigin: _captureChatCacheOrigin(wsId, storedChatId),
      );
      if (!current()) return;

      if (restored == null) {
        await _preferences.clearChatId(wsId, shouldWrite: current);
        if (!current()) return;
        _emitIfOpen(
          state.copyWith(
            status: AssistantChatStatus.idle,
            hasLoadedOnce: true,
            chat: null,
            storedChatId: null,
            messages: const [],
            attachmentsByMessageId: const {},
          ),
        );
        await _onChatRestored(null);
        return;
      }

      _emitIfOpen(
        state.copyWith(
          status: AssistantChatStatus.idle,
          hasLoadedOnce: true,
          diagnostics: _repository.chatCacheDiagnostics,
          chat: restored.chat,
          storedChatId: restored.chat?.id,
          messages: restored.messages,
          attachmentsByMessageId: restored.attachmentsByMessageId,
        ),
      );
      await _onChatRestored(restored.chat?.model);
    } on Object catch (error) {
      if (!current()) return;
      _emitIfOpen(
        state.copyWith(
          status: AssistantChatStatus.error,
          error: error is AssistantChatCacheCancellation
              ? null
              : error.toString(),
          diagnostics: SafeErrorDiagnostics.capture(
            error,
            DiagnosticStage.assistantReply,
          ),
        ),
      );
    }
  }

  Future<void> _openChat(String wsId, AssistantChatRecord chat) =>
      _openChatById(wsId, chat.id);

  Future<void> _openChatById(
    String wsId,
    String chatId, {
    bool forceRefresh = false,
  }) async {
    _repository.invalidateChatCreation();
    final actor = _repository.currentActorId;
    final version = ++_workspaceVersion;
    bool current() =>
        !isClosed &&
        version == _workspaceVersion &&
        state.workspaceId == wsId &&
        _repository.currentActorId == actor;
    _emitIfOpen(
      state.copyWith(
        workspaceId: wsId,
        status:
            forceRefresh &&
                state.chat?.id == chatId &&
                state.workspaceId == wsId
            ? state.status
            : AssistantChatStatus.restoring,
        clearError: true,
      ),
    );
    unawaited(_refreshHistoryFor(wsId, version));
    try {
      final restored = await _repository.restoreChat(
        wsId: wsId,
        chatId: chatId,
        forceRefresh: forceRefresh,
        cacheOrigin: _captureChatCacheOrigin(wsId, chatId),
      );
      if (!current()) return;
      if (restored == null) {
        _emitIfOpen(
          state.copyWith(
            status: AssistantChatStatus.error,
            error: 'Failed to load chat history.',
          ),
        );
        return;
      }
      _emitIfOpen(
        state.copyWith(
          status: AssistantChatStatus.idle,
          hasLoadedOnce: true,
          diagnostics: _repository.chatCacheDiagnostics,
          chat: restored.chat,
          storedChatId: chatId,
          messages: restored.messages,
          attachmentsByMessageId: restored.attachmentsByMessageId,
        ),
      );
      await _preferences.saveChatId(wsId, chatId, shouldWrite: current);
      if (!current()) return;
      await _onChatRestored(restored.chat?.model);
    } on Object catch (error) {
      if (!current()) return;
      _emitIfOpen(
        state.copyWith(
          status: AssistantChatStatus.error,
          error: error is AssistantChatCacheCancellation
              ? null
              : error.toString(),
          diagnostics: SafeErrorDiagnostics.capture(
            error,
            DiagnosticStage.assistantReply,
          ),
        ),
      );
    }
  }

  Future<void> _refreshHistory() =>
      _refreshHistoryFor(state.workspaceId, _workspaceVersion);

  Future<void> _refreshHistoryFor(String? wsId, int version) async {
    final historyVersion = ++_historyVersion;
    try {
      final history = await _repository.fetchRecentChats(wsId: wsId);
      if (isClosed || version != _workspaceVersion) return;
      if (historyVersion != _historyVersion) return;
      _emitIfOpen(state.copyWith(history: history));
    } on Exception {
      // History is secondary; preserve the conversation and retry on next open.
    }
  }
}
