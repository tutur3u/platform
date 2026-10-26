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
          icon: LucideIcons.messageCircle,
          tooltip: context.l10n.assistantAskPlaceholder,
          // Opening an unsent local draft needs no network authentication.
          onPressed: guarded(_restoreComposerAndFocus, localDraft: true),
        ),
      if (isLiveMode)
        ShellActionSpec(
          id: 'assistant-live-info',
          icon: LucideIcons.info,
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
        icon: LucideIcons.ellipsis,
        tooltip: MaterialLocalizations.of(context).showMenuTooltip,
        callbackToken: (_localScope(), isLiveMode),
        onPressed: guarded(() => unawaited(_showAssistantMore(isLiveMode))),
      ),
      ShellActionSpec(
        id: 'assistant-mode-chat',
        segmentGroup: 'assistant-modes',
        icon: LucideIcons.messageCircle,
        tooltip: context.l10n.chatTitle,
        highlighted: !isLiveMode,
        onPressed: isLiveMode
            ? guarded(() => unawaited(_exitLiveMode()))
            : null,
      ),
      ShellActionSpec(
        id: 'assistant-mode-live',
        segmentGroup: 'assistant-modes',
        icon: LucideIcons.audioLines,
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
    final l10n = context.l10n;
    final choice = await showAppActionSheet<String>(
      context: context,
      title: l10n.commonMoreOptions,
      actions: [
        if (!isLiveMode)
          AppSheetAction(
            key: const ValueKey('assistant-more-history'),
            icon: LucideIcons.history,
            label: l10n.assistantHistoryTitle,
            value: 'history',
          ),
        AppSheetAction(
          key: const ValueKey('assistant-more-settings'),
          icon: LucideIcons.slidersHorizontal,
          label: l10n.assistantSettingsTitle,
          value: 'settings',
        ),
        if (!isLiveMode)
          AppSheetAction(
            key: const ValueKey('assistant-more-appearance'),
            icon: LucideIcons.palette,
            label: l10n.assistantThemeTitle,
            value: 'appearance',
          ),
      ],
    );
    if (!mounted || scope != _localScope()) return;
    if (choice == 'history') {
      await _showHistorySheet(context, _loadedWorkspaceId!);
    }
    if (choice == 'settings') await _showLiveSettings();
    if (choice == 'appearance') await _showChatTheme();
  }

  void _toggleLiveDockNavigation() {
    context.read<AssistantChromeCubit>().toggleComposerNavigation();
  }

  Widget _livePrimaryAction() => AssistantLivePrimaryAction(
    key: const ValueKey('assistant-dock-primary'),
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
    onDisconnect: () async {
      if (liveState.isBusy) {
        await _cancelLiveDockCall(wsId);
      } else if (liveState.status == AssistantLiveConnectionStatus.connected) {
        await _liveCubit.disconnect(clearSession: true, finishTurn: true);
      } else {
        await _exitLiveMode();
      }
    },
  );

  Future<void> _cancelLiveDockCall(String wsId) async {
    final epoch = _voiceActorScopeEpoch;
    final attempt = _liveStartGate.currentFor(epoch);
    await _liveCubit.disconnect(clearSession: true);
    if (mounted &&
        epoch == _voiceActorScopeEpoch &&
        _loadedWorkspaceId == wsId) {
      _liveStartGate.cancel(attempt);
    }
  }

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
