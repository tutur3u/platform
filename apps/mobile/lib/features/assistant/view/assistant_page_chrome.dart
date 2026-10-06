part of 'assistant_page.dart';

extension _AssistantPageChrome on _AssistantPageState {
  List<ShellActionSpec> _buildChromeActions(
    BuildContext context, {
    required String wsId,
    required AssistantShellState shellState,
    required AssistantChatState chatState,
    required AssistantLiveState liveState,
    required bool isLiveMode,
  }) {
    final scope = _localScope();
    final actor = _currentActor();
    final epoch = _voiceActorScopeEpoch;
    final l10n = context.l10n;
    final material = MaterialLocalizations.of(context);
    final liveUi = isLiveMode
        ? deriveAssistantLiveUiState(
            shellState: shellState,
            liveState: liveState,
            isEligible: _hasLiveAccess(shellState),
            showBlockedReason: false,
            isVisibleLiveSession: _isVisibleLiveSession(chatState, liveState),
          )
        : null;
    final key = (
      scope,
      actor,
      epoch,
      wsId,
      isLiveMode,
      _isComposerVisible,
      l10n,
      material,
      liveUi,
      isLiveMode ? liveState : null,
    );
    if (_chromeActionsKey == key && _chromeActions != null) {
      return _chromeActions!;
    }
    _chromeActionsKey = key;
    VoidCallback guarded(VoidCallback action, {bool localDraft = false}) => () {
      if (!mounted ||
          !context.mounted ||
          (!localDraft && scope == null) ||
          actor != _currentActor() ||
          epoch != _voiceActorScopeEpoch ||
          wsId != _loadedWorkspaceId ||
          scope != _localScope() ||
          _chromeActionsKey != key ||
          context.read<AssistantChromeCubit>().state.isLiveMode != isLiveMode) {
        return;
      }
      action();
    };
    return _chromeActions = <ShellActionSpec>[
      if (!_isComposerVisible && !isLiveMode)
        ShellActionSpec(
          id: 'assistant-compose',
          inDock: true,
          icon: Icons.chat_bubble_outline_rounded,
          tooltip: context.l10n.assistantAskPlaceholder,
          // Opening an unsent local draft needs no network authentication.
          onPressed: guarded(_restoreComposerAndFocus, localDraft: true),
        ),
      if (isLiveMode)
        ShellActionSpec(
          id: 'assistant-live-info',
          icon: Icons.info_outline_rounded,
          tooltip: context.l10n.assistantLiveInfoTitle,
          callbackToken:
              '$wsId:${liveState.status}:${liveState.startupTimings}',
          onPressed: guarded(
            () => unawaited(
              _showLiveInfoSheet(
                context,
                liveUiState: liveUi!,
                liveState: liveState,
              ),
            ),
          ),
        ),
      ShellActionSpec(
        id: 'assistant-more',
        icon: Icons.more_horiz_rounded,
        tooltip: MaterialLocalizations.of(context).showMenuTooltip,
        callbackToken: (_localScope(), isLiveMode),
        onPressed: guarded(() => unawaited(_showAssistantMore(isLiveMode))),
      ),
      ShellActionSpec(
        id: 'assistant-mode-chat',
        segmentGroup: 'assistant-modes',
        icon: Icons.chat_bubble_outline_rounded,
        tooltip: context.l10n.chatTitle,
        highlighted: !isLiveMode,
        onPressed: isLiveMode
            ? guarded(() => unawaited(_exitLiveMode()))
            : null,
      ),
      ShellActionSpec(
        id: 'assistant-mode-live',
        segmentGroup: 'assistant-modes',
        icon: Icons.graphic_eq_rounded,
        tooltip: context.l10n.commonLive,
        highlighted: isLiveMode,
        onPressed: isLiveMode
            ? null
            : guarded(() => unawaited(_handleMicrophoneTap(wsId))),
      ),
    ];
  }

  Future<void> _showAssistantMore(bool isLiveMode) async {
    final scope = _localScope();
    if (scope == null) return;
    final choice = await showAdaptiveSheet<String>(
      context: context,
      builder: (sheetContext) => Material(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!isLiveMode)
              ListTile(
                leading: const Icon(Icons.history_rounded),
                title: Text(context.l10n.assistantHistoryTitle),
                onTap: () => Navigator.of(sheetContext).pop('history'),
              ),
            ListTile(
              leading: const Icon(Icons.tune_rounded),
              title: Text(context.l10n.assistantSettingsTitle),
              onTap: () => Navigator.of(sheetContext).pop('settings'),
            ),
          ],
        ),
      ),
    );
    if (!mounted || scope != _localScope()) return;
    if (choice == 'history') {
      await _showHistorySheet(context, _loadedWorkspaceId!);
    }
    if (choice == 'settings') await _showLiveSettings();
  }

  void _toggleLiveDockNavigation() {
    context.read<AssistantChromeCubit>().toggleComposerNavigation();
  }

  Widget _livePrimaryAction(
    String wsId,
    AssistantChatState chatState,
    AssistantLiveState liveState,
  ) => AssistantLivePrimaryAction(
    state: liveState,
    assistantName: _shellCubit.state.soul.name,
    onCall: () => _handleLiveMicrophoneToggle(wsId, chatState),
    onCancel: () async {
      final epoch = _voiceActorScopeEpoch;
      final attempt = _liveStartGate.currentFor(epoch);
      await _liveCubit.disconnect(clearSession: true);
      if (mounted &&
          epoch == _voiceActorScopeEpoch &&
          _loadedWorkspaceId == wsId) {
        _liveStartGate.cancel(attempt);
      }
    },
    onNavigation: () {
      _inputFocusNode.unfocus();
      _toggleLiveDockNavigation();
    },
  );

  Widget _liveCallDock(
    String wsId,
    AssistantChatState chatState,
    AssistantLiveState liveState,
  ) => AssistantLiveCallControls(
    state: liveState,
    onMicrophone: () => _handleLiveMicrophoneToggle(wsId, chatState),
    onCamera: _liveCubit.toggleCamera,
    onText: _openChatComposerFromLiveMode,
    onDisconnect: () =>
        _liveCubit.disconnect(clearSession: true, finishTurn: true),
  );

  bool _hasLiveAccess(AssistantShellState shellState) {
    return hasAssistantLiveWorkspaceAccess(
      shellState.workspaceCredits,
      workspaceTier: shellState.workspace?.tier,
    );
  }

  bool _isCurrentChatLive(
    AssistantChatState chatState,
    AssistantLiveState liveState,
  ) {
    final activeChatId = chatState.chat?.id ?? chatState.storedChatId;
    return isSameAssistantLiveChat(activeChatId, liveState.chatId);
  }

  bool _isVisibleLiveSession(
    AssistantChatState chatState,
    AssistantLiveState liveState,
  ) {
    final activeChatId = chatState.chat?.id ?? chatState.storedChatId;
    if (liveState.workspaceId != null &&
        chatState.workspaceId != null &&
        liveState.workspaceId != chatState.workspaceId) {
      return false;
    }
    if (liveState.chatId == null) return false;
    if (activeChatId == null) return true;
    return isSameAssistantLiveChat(activeChatId, liveState.chatId) ||
        liveState.status != AssistantLiveConnectionStatus.disconnected;
  }

  bool _shouldSendThroughLive(
    AssistantChatState chatState,
    AssistantLiveState liveState,
  ) {
    return _isCurrentChatLive(chatState, liveState) &&
        liveState.chatId != null &&
        liveState.status != AssistantLiveConnectionStatus.disconnected;
  }

  bool _hasTranscript(
    AssistantChatState chatState,
    AssistantLiveState liveState,
  ) {
    return chatState.messages.isNotEmpty || liveState.hasDraft;
  }
}
