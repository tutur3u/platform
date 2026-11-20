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
      widget.shellLocation,
      l10n,
      material,
      liveUi,
      isLiveMode ? liveState : null,
    );
    if (_chromeActionsKey == key && _chromeActions != null) {
      return _chromeActions!;
    }
    _chromeActionsKey = key;
    VoidCallback guarded(VoidCallback action) => () {
      if (!mounted ||
          !context.mounted ||
          scope == null ||
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
      if (!isLiveMode) ...[
        ShellActionSpec(
          id: 'assistant-conversations',
          icon: LucideIcons.history,
          tooltip: l10n.assistantConversationsTitle,
          onPressed: guarded(
            () => unawaited(_openConversations(context, wsId)),
          ),
        ),
        ShellActionSpec(
          id: 'assistant-new-conversation',
          icon: LucideIcons.messageSquarePlus,
          tooltip: l10n.assistantNewConversation,
          onPressed: guarded(
            () => unawaited(_startNewConversation(wsId, chatState, liveState)),
          ),
        ),
      ],
      ShellActionSpec(
        id: 'assistant-more',
        icon: LucideIcons.ellipsis,
        tooltip: MaterialLocalizations.of(context).showMenuTooltip,
        callbackToken: (_localScope(), isLiveMode),
        onPressed: guarded(() => unawaited(_showAssistantMore(isLiveMode))),
      ),
      if (isLiveMode)
        ShellActionSpec(
          id: 'assistant-mode-chat',
          segmentGroup: 'assistant-modes',
          icon: LucideIcons.messageCircle,
          tooltip: context.l10n.chatTitle,
          highlighted: !isLiveMode,
          onPressed: guarded(() => unawaited(_exitLiveMode())),
        ),
      if (isLiveMode)
        ShellActionSpec(
          id: 'assistant-mode-live',
          segmentGroup: 'assistant-modes',
          icon: LucideIcons.audioLines,
          tooltip: context.l10n.commonLive,
          highlighted: isLiveMode,
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
            key: const ValueKey('assistant-more-live'),
            icon: LucideIcons.audioLines,
            label: l10n.commonLive,
            value: 'live',
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
    if (choice == 'live') await _handleMicrophoneTap(_loadedWorkspaceId!);
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

  /// Live access is the server's decision for the billed workspace; the
  /// current workspace's tier says nothing about it. Unknown stays open and
  /// the token route decides on start.
  bool _hasLiveAccess(AssistantShellState shellState) =>
      _liveBlock(shellState.workspace?.id) == null;

  AssistantLiveEligibility? _liveBlock(String? wsId) {
    final actor = _currentActor();
    if (actor == null || wsId == null) return null;
    final state = _liveEligibilityCubit.state;
    return state.blockedFor('$actor:$wsId') ? state.eligibility : null;
  }

  /// Checks eligibility before a start. Returns false after explaining a
  /// refusal, so ineligible accounts never see a failing connect attempt.
  Future<bool> _admitLiveStart(String wsId) async {
    final actor = _currentActor();
    if (actor == null) return true;
    final eligibility = await _liveEligibilityCubit.ensure(
      actorId: actor,
      wsId: wsId,
    );
    if (!mounted || eligibility == null || !eligibility.blocked) return true;
    await showAssistantLiveBlockedSheet(context, eligibility: eligibility);
    return false;
  }

  /// A token refusal after a stale pre-check updates the lock.
  void _refreshLiveEligibilityAfter(String wsId) {
    final actor = _currentActor();
    final error = _liveCubit.state.error;
    if (actor == null || !_liveRefusalTokens.contains(error)) return;
    unawaited(
      _liveEligibilityCubit.ensure(actorId: actor, wsId: wsId, force: true),
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

const Set<String> _liveRefusalTokens = {
  AssistantLiveFailure.paused,
  AssistantLiveFailure.dailyLimit,
  AssistantLiveFailure.credits,
  AssistantLiveFailure.notAllowed,
};
