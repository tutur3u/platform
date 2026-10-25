part of 'assistant_page.dart';

extension _AssistantPageLiveActions on _AssistantPageState {
  Future<void> _handleMicrophoneTap(String wsId) async {
    if (_localCubit.state.local || _localCubit.state.blocked) {
      _showInlineNotice(context.l10n.assistantLocalTextOnly);
      return;
    }
    final guard = _remoteGuard(wsId);
    if (!await guard.run(() => _workspaceDisconnect) || !mounted) return;
    final shellState = _shellCubit.state;
    if (shellState.workspace?.id != wsId) return;
    final chatState = _chatCubit.state;
    final liveState = _liveCubit.state;
    if (!_hasLiveAccess(shellState)) {
      final blockedState = deriveAssistantLiveUiState(
        shellState: shellState,
        liveState: liveState,
        isEligible: false,
        isVisibleLiveSession: _isVisibleLiveSession(chatState, liveState),
        showBlockedReason: true,
      );
      await _showLiveInfoSheet(
        context,
        liveUiState: blockedState,
        liveState: liveState,
      );
      return;
    }

    _dismissKeyboard();
    context.read<AssistantChromeCubit>().enterLiveMode();
  }

  Future<void> _showLiveInfoSheet(
    BuildContext context, {
    required AssistantLiveUiState liveUiState,
    required AssistantLiveState liveState,
  }) async {
    await showAppSheet<void>(
      context: context,
      builder: (sheetContext) => AssistantLiveInfoSheetBody(
        liveUiState: liveUiState,
        liveState: liveState,
        onClose: () => Navigator.of(sheetContext).maybePop(),
      ),
    );
  }

  Future<void> _handleLiveRetry(
    String wsId,
    AssistantChatState chatState,
  ) async {
    if (_liveStartPending ||
        _localCubit.state.local ||
        _localCubit.state.blocked) {
      return;
    }
    final guard = _remoteGuard(wsId);
    final attempt = _liveStartGate.begin(_voiceActorScopeEpoch);
    if (attempt == null) return;
    try {
      if (!await guard.run(() => _workspaceDisconnect) || !mounted) return;
      await _liveCubit.prepareSession(
        wsId: wsId,
        chatId: chatState.chat?.id ?? chatState.storedChatId,
        reconnect: _liveCubit.state.chatId != null,
      );
    } finally {
      _liveStartGate.finish(attempt);
    }
  }

  Future<void> _handleLiveMicrophoneToggle(
    String wsId,
    AssistantChatState chatState,
  ) async {
    if (_liveCubit.state.isMicrophoneActive) {
      await _liveCubit.toggleMicrophone();
      return;
    }
    await _enterLiveMode(
      wsId: wsId,
      activeChatId: chatState.chat?.id ?? chatState.storedChatId,
      autoStartMicrophone: true,
    );
  }

  Future<void> _enterLiveMode({
    required String wsId,
    required String? activeChatId,
    required bool autoStartMicrophone,
  }) async {
    if (_liveStartPending ||
        _localCubit.state.local ||
        _localCubit.state.blocked) {
      return;
    }
    final guard = _remoteGuard(wsId);
    final epoch = _voiceActorScopeEpoch;
    final attempt = _liveStartGate.begin(epoch);
    if (attempt == null) return;
    final startSettled = Completer<void>();
    try {
      if (!await guard.run(() => _workspaceDisconnect) || !mounted) return;
      _dismissKeyboard();
      context.read<AssistantChromeCubit>().enterLiveMode();
      if (!autoStartMicrophone) return;

      final liveState = _liveCubit.state;
      final isVisibleLiveSession = _isVisibleLiveSession(
        _chatCubit.state,
        liveState,
      );
      // Starting (not unmuting) a call opens the full-screen call surface.
      if (!isVisibleLiveSession || liveState.status.isDisconnectedOrErrored) {
        unawaited(_presentLiveCall(wsId, startAttempt: startSettled.future));
      }
      // The page syncs a workspace switch on its next build; read the live
      // selection too, so a token answered in between cannot open a call for
      // the previous workspace.
      bool workspaceSelected() =>
          mounted &&
          context.read<WorkspaceCubit>().state.currentWorkspace?.id == wsId;
      await enableAssistantLiveMicrophone(
        liveCubit: _liveCubit,
        prepareSession:
            !isVisibleLiveSession || liveState.status.isDisconnectedOrErrored
            ? () => _liveCubit.prepareSession(
                wsId: wsId,
                chatId: activeChatId,
                model: assistantLiveModelId,
                isCurrent: workspaceSelected,
              )
            : null,
        isCurrent: () =>
            guard.current &&
            workspaceSelected() &&
            identical(_liveStartGate.currentFor(epoch), attempt) &&
            context.read<AssistantChromeCubit>().state.isLiveMode &&
            _loadedWorkspaceId == wsId,
      );
    } finally {
      startSettled.complete();
      _liveStartGate.finish(attempt);
    }
  }

  Future<void> _exitLiveMode() async {
    final wsId = _loadedWorkspaceId;
    final epoch = _voiceActorScopeEpoch;
    final attempt = _liveStartGate.currentFor(epoch);
    bool current() =>
        mounted && epoch == _voiceActorScopeEpoch && _loadedWorkspaceId == wsId;
    await _liveBrowsingPreferenceLoad;
    if (!mounted || !current()) return;
    if (!_keepLiveWhileBrowsing) {
      // The opt-in browsing setting is the only path that retains media tracks.
      await _liveCubit.disconnect();
      if (!mounted || !current()) return;
      _liveStartGate.cancel(attempt);
    }
    context.read<AssistantChromeCubit>().exitLiveMode();
  }

  Future<void> _showLiveSettings() async {
    final wsId = _loadedWorkspaceId;
    if (wsId == null) return;
    final scope = _localScope();
    await _chatCubit.stopStreaming(discardQueued: true);
    if (!mounted || scope != _localScope()) return;
    await _voiceCapture.cancel();
    await _liveCubit.disconnect();
    await _localCubit.invalidate();
    if (!mounted || scope != _localScope()) return;
    await context.push(Routes.settingsAppPath('assistant'));
    if (!mounted || scope != _localScope()) return;
    await refreshAssistantSettings(
      refreshSoul: _shellCubit.refreshSoul,
      isCurrent: () => mounted && scope == _localScope(),
      onRefreshFailure: () =>
          _showInlineNotice(context.l10n.assistantPersonalSettingsError),
      reloadPreferences: () => _loadLiveBrowsingPreference(wsId),
      resume: _resumeLocal,
    );
  }

  Future<void> _openChatComposerFromLiveMode() async {
    await _exitLiveMode();
    if (!mounted) {
      return;
    }
    _restoreComposerAndFocus();
  }
}

/// Gives one microphone intent a single attempt across session preparation.
Future<void> enableAssistantLiveMicrophone({
  required AssistantLiveCubit liveCubit,
  required Future<void> Function()? prepareSession,
  required bool Function() isCurrent,
}) async {
  if (!isCurrent() || liveCubit.isClosed) return;
  if (prepareSession != null) {
    final failed = Completer<void>();
    final subscription = liveCubit.stream.listen((state) {
      if (isCurrent() &&
          state.status == AssistantLiveConnectionStatus.error &&
          !failed.isCompleted) {
        failed.complete();
      }
    });
    try {
      final connecting = prepareSession();
      // Future.any retains the wait's handlers after terminal failure wins.
      // Retire this preparation before releasing page ownership to a retry.
      await Future.any<void>([
        Future.wait<void>([
          connecting,
          if (!liveCubit.state.isMicrophoneActive) liveCubit.toggleMicrophone(),
        ]).then<void>((_) {}),
        failed.future,
      ]);
      if (isCurrent() &&
          !liveCubit.isClosed &&
          liveCubit.state.status == AssistantLiveConnectionStatus.error) {
        await liveCubit.disconnect(preserveFailure: true);
      }
    } finally {
      await subscription.cancel();
    }
  }

  if (!isCurrent() ||
      liveCubit.isClosed ||
      liveCubit.state.status == AssistantLiveConnectionStatus.error) {
    return;
  }
  if (prepareSession == null && !liveCubit.state.isMicrophoneActive) {
    await liveCubit.toggleMicrophone();
  }
}
