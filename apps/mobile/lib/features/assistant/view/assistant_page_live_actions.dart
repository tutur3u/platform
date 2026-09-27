part of 'assistant_page.dart';

extension _AssistantPageLiveActions on _AssistantPageState {
  Future<void> _handleMicrophoneTap(
    String wsId,
    AssistantShellState shellState,
    AssistantChatState chatState,
    AssistantLiveState liveState,
  ) async {
    await _workspaceDisconnect;
    if (!mounted || _loadedWorkspaceId != wsId) return;
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
    await showAdaptiveSheet<void>(
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
    if (_liveStartPending) return;
    _liveStartPending = true;
    try {
      await _workspaceDisconnect;
      if (!mounted || !_appIsForeground || _loadedWorkspaceId != wsId) return;
      await _liveCubit.prepareSession(
        wsId: wsId,
        chatId: chatState.chat?.id ?? chatState.storedChatId,
        reconnect: _liveCubit.state.chatId != null,
      );
    } finally {
      _liveStartPending = false;
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
    if (_liveStartPending) return;
    _liveStartPending = true;
    try {
      await _workspaceDisconnect;
      if (!mounted || !_appIsForeground || _loadedWorkspaceId != wsId) return;
      _dismissKeyboard();
      context.read<AssistantChromeCubit>().enterLiveMode();
      if (!autoStartMicrophone) return;

      final liveState = _liveCubit.state;
      final isVisibleLiveSession = _isVisibleLiveSession(
        _chatCubit.state,
        liveState,
      );
      if (!isVisibleLiveSession || liveState.status.isDisconnectedOrErrored) {
        final connecting = _liveCubit.prepareSession(
          wsId: wsId,
          chatId: activeChatId,
          model: assistantLiveModelId,
        );
        if (autoStartMicrophone && !_liveCubit.state.isMicrophoneActive) {
          await Future.wait([connecting, _liveCubit.toggleMicrophone()]);
        } else {
          await connecting;
        }
      }

      if (!mounted ||
          !_appIsForeground ||
          !context.read<AssistantChromeCubit>().state.isLiveMode ||
          _liveCubit.state.status == AssistantLiveConnectionStatus.error ||
          _loadedWorkspaceId != wsId) {
        return;
      }

      if (!_liveCubit.state.isMicrophoneActive) {
        await _liveCubit.toggleMicrophone();
      }
    } finally {
      _liveStartPending = false;
    }
  }

  Future<void> _exitLiveMode() async {
    await _liveBrowsingPreferenceLoad;
    if (!mounted) return;
    if (!_keepLiveWhileBrowsing) {
      // The opt-in browsing setting is the only path that retains media tracks.
      await _liveCubit.disconnect();
    }
    if (!mounted) {
      return;
    }
    context.read<AssistantChromeCubit>().exitLiveMode();
  }

  Future<void> _showLiveSettings() async {
    final wsId = _loadedWorkspaceId;
    if (wsId == null) return;
    await showAdaptiveSheet<void>(
      context: context,
      builder: (sheetContext) => AssistantSettingsSheetBody(
        keepLiveWhileBrowsing: _keepLiveWhileBrowsing,
        onKeepLiveWhileBrowsingChanged: ({required value}) async {
          try {
            await _preferences.saveKeepLiveWhileBrowsing(wsId, value: value);
          } on Exception {
            if (sheetContext.mounted) Navigator.of(sheetContext).pop();
            if (mounted) {
              _showInlineNotice(context.l10n.assistantLiveSettingSaveError);
            }
            return;
          }
          if (!mounted || _loadedWorkspaceId != wsId) return;
          _setKeepLiveWhileBrowsing(value);
          if (!value &&
              !context.read<AssistantChromeCubit>().state.isLiveMode) {
            await _liveCubit.disconnect();
          }
          if (sheetContext.mounted) Navigator.of(sheetContext).pop();
        },
      ),
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
