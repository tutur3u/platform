part of 'assistant_page.dart';

extension _AssistantPageChrome on _AssistantPageState {
  List<ShellActionSpec> _buildChromeActions(
    BuildContext context, {
    required String wsId,
    required AssistantShellState shellState,
    required AssistantChatState chatState,
    required AssistantLiveState liveState,
    required bool isLiveMode,
  }) => <ShellActionSpec>[
    if (!_isComposerVisible && !isLiveMode)
      ShellActionSpec(
        id: 'assistant-compose',
        inDock: true,
        icon: Icons.chat_bubble_outline_rounded,
        tooltip: context.l10n.assistantAskPlaceholder,
        onPressed: _restoreComposerAndFocus,
      ),
    if (!isLiveMode)
      ShellActionSpec(
        id: 'assistant-history',
        icon: Icons.history_rounded,
        callbackToken: '${identityHashCode(this)}:$wsId:${widget.replayToken}',
        tooltip: context.l10n.assistantHistoryTitle,
        onPressed: () => unawaited(_showHistorySheet(context, wsId)),
      ),
    ShellActionSpec(
      id: 'assistant-settings',
      icon: Icons.tune_rounded,
      tooltip: context.l10n.assistantSettingsTitle,
      callbackToken: '$wsId:$_keepLiveWhileBrowsing',
      onPressed: () => unawaited(_showLiveSettings()),
    ),
    if (isLiveMode &&
        liveState.status == AssistantLiveConnectionStatus.disconnected)
      ShellActionSpec(
        id: 'assistant-live-start',
        inDock: true,
        icon: Icons.mic_rounded,
        tooltip: context.l10n.assistantLiveConnect,
        callbackToken: '$wsId:${liveState.status}',
        onPressed: () =>
            unawaited(_handleLiveMicrophoneToggle(wsId, chatState)),
      ),
    ShellActionSpec(
      id: 'assistant-mode-chat',
      segmentGroup: 'assistant-modes',
      icon: Icons.chat_bubble_outline_rounded,
      tooltip: context.l10n.chatTitle,
      highlighted: !isLiveMode,
      onPressed: isLiveMode ? () => unawaited(_exitLiveMode()) : null,
    ),
    ShellActionSpec(
      id: 'assistant-mode-live',
      segmentGroup: 'assistant-modes',
      icon: Icons.graphic_eq_rounded,
      tooltip: context.l10n.commonLive,
      highlighted: isLiveMode,
      onPressed: isLiveMode
          ? null
          : () => unawaited(_handleMicrophoneTap(wsId)),
    ),
  ];

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

  String? _resolveCreditWorkspaceId(
    AssistantShellState shellState,
    String wsId,
  ) {
    return shellState.creditSource == AssistantCreditSource.personal
        ? shellState.personalWorkspaceId
        : wsId;
  }
}
