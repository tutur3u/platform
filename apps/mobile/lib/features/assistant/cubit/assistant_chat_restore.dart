part of 'assistant_chat_cubit.dart';

extension _AssistantChatRestore on AssistantChatCubit {
  Future<void> _loadWorkspace(String wsId) async {
    _repository.invalidateChatCreation();
    _restoredSettings = null;
    final workspaceVersion = ++_workspaceVersion;
    final actor = _repository.currentActorId;
    bool current() =>
        !isClosed &&
        workspaceVersion == _workspaceVersion &&
        _repository.currentActorId == actor;
    final preserveState = state.workspaceId == wsId && state.hasLoadedOnce;
    await _cancelReplyStream();
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
        _publishRestoredSettings(null);
        await _onChatRestored(null);
        return;
      }

      // A restore failure retains the selected identity. It is not a new chat.
      _emitIfOpen(state.copyWith(storedChatId: storedChatId));
      final initialRestore = Completer<void>();
      List<AssistantMessage>? initialMessages;
      final origin = _captureChatCacheOrigin(wsId, storedChatId);
      final revalidatingOrigin = origin == null
          ? null
          : AssistantChatCacheOrigin(
              key: origin.key,
              epoch: origin.epoch,
              revision: origin.revision,
              isCurrent: origin.isCurrent,
              onRevalidated: (fresh) async {
                await initialRestore.future;
                if (!current() ||
                    !origin.isCurrent() ||
                    fresh == null ||
                    state.storedChatId != storedChatId ||
                    state.isBusy ||
                    !identical(state.messages, initialMessages)) {
                  return;
                }
                _publishRestoredSettings(fresh.settings);
                _emitIfOpen(
                  state.copyWith(
                    chat: fresh.chat,
                    messages: fresh.messages,
                    attachmentsByMessageId: fresh.attachmentsByMessageId,
                  ),
                );
                await _onChatRestored(fresh.chat?.model);
              },
            );
      late final AssistantRestoredChat? restored;
      try {
        restored = await _repository.restoreChat(
          wsId: wsId,
          chatId: storedChatId,
          cacheOrigin: revalidatingOrigin,
        );
        initialMessages = restored?.messages;
      } finally {
        // Revalidation publishes after the initial cached snapshot below.
        scheduleMicrotask(initialRestore.complete);
      }
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
        _publishRestoredSettings(null);
        await _onChatRestored(null);
        return;
      }

      _publishRestoredSettings(restored.settings);
      if (!current()) return;
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
    _restoredSettings = null;
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
      _publishRestoredSettings(restored.settings);
      if (!current()) return;
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

  AssistantChatCacheOrigin? _captureChatCacheOrigin(
    String wsId,
    String chatId,
  ) {
    final version = _workspaceVersion;
    final actor = _repository.currentActorId;
    final origin = _repository.captureChatCacheOrigin(
      wsId: wsId,
      chatId: chatId,
      isCurrent: () =>
          !isClosed &&
          version == _workspaceVersion &&
          _repository.currentActorId == actor &&
          state.workspaceId == wsId,
    );
    if (origin != null) {
      _hasChatCacheOrigin = true;
    }
    return origin;
  }

  void _persistAssistantChatCache() {
    final wsId = state.workspaceId;
    final chatId = state.chat?.id ?? state.storedChatId;
    if (wsId == null || chatId == null) return;
    final origin = _captureChatCacheOrigin(wsId, chatId);
    if (origin == null) return;
    final restored = AssistantRestoredChat(
      chat: state.chat,
      settings: _restoredSettings,
      messages: state.messages,
      attachmentsByMessageId: state.attachmentsByMessageId,
    );
    late Future<void> observed;
    observed =
        Future.sync(
              () => _repository.publishAssistantChatSnapshot(
                origin: origin,
                restored: restored,
              ),
            )
            .then<void>(
              (result) {
                if (origin.isCurrent() &&
                    result.status == AssistantChatCacheStatus.failed) {
                  _emitIfOpen(state.copyWith(diagnostics: result.diagnostics));
                }
              },
              onError: (Object error, StackTrace stack) {
                if (origin.isCurrent()) {
                  _operationalReporter.report(
                    OperationalPhase.assistantReply,
                    error,
                  );
                }
              },
            )
            .whenComplete(() => _chatCacheObservers.remove(observed));
    _chatCacheObservers.add(observed);
  }
}
