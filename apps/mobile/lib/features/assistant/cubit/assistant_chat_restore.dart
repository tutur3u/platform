part of 'assistant_chat_cubit.dart';

extension _AssistantChatRestore on AssistantChatCubit {
  Future<void> _loadWorkspace(String wsId) async {
    final workspaceVersion = ++_workspaceVersion;
    final preserveState = state.workspaceId == wsId && state.hasLoadedOnce;
    await _streamSubscription?.cancel();
    if (isClosed || workspaceVersion != _workspaceVersion) return;
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
      final storedChatId = await _preferences.loadChatId(wsId);
      if (isClosed || workspaceVersion != _workspaceVersion) return;

      if (storedChatId == null) {
        if (isClosed || workspaceVersion != _workspaceVersion) return;
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

      final restored = await _repository.restoreChat(
        wsId: wsId,
        chatId: storedChatId,
      );
      if (isClosed || workspaceVersion != _workspaceVersion) return;

      if (restored == null) {
        await _preferences.clearChatId(
          wsId,
          shouldWrite: () => !isClosed && workspaceVersion == _workspaceVersion,
        );
        if (isClosed || workspaceVersion != _workspaceVersion) return;
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
          chat: restored.chat,
          storedChatId: restored.chat?.id,
          messages: restored.messages,
          attachmentsByMessageId: restored.attachmentsByMessageId,
        ),
      );
      await _onChatRestored(restored.chat?.model);
    } on Exception catch (error) {
      if (isClosed || workspaceVersion != _workspaceVersion) return;
      _emitIfOpen(
        state.copyWith(
          status: AssistantChatStatus.error,
          error: error.toString(),
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
    final version = ++_workspaceVersion;
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
      );
      if (isClosed || version != _workspaceVersion) return;
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
          chat: restored.chat,
          storedChatId: chatId,
          messages: restored.messages,
          attachmentsByMessageId: restored.attachmentsByMessageId,
        ),
      );
      await _preferences.saveChatId(
        wsId,
        chatId,
        shouldWrite: () => !isClosed && version == _workspaceVersion,
      );
      if (isClosed || version != _workspaceVersion) return;
      await _onChatRestored(restored.chat?.model);
    } on Exception catch (error) {
      if (isClosed || version != _workspaceVersion) return;
      _emitIfOpen(
        state.copyWith(
          status: AssistantChatStatus.error,
          error: error.toString(),
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
