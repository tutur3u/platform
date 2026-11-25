part of 'assistant_page.dart';

/// History surfaces inside the Mira page: the wide-screen sidebar beside the
/// thread and the recent conversations on the new-chat screen.
extension _AssistantPageHistoryPanes on _AssistantPageState {
  /// Width of the history sidebar, or 0 when it is hidden. Records whether
  /// the window is wide enough for it, so the history action toggles the
  /// sidebar there instead of opening the Conversations page.
  double _historySidebarWidthFor(
    BuildContext context, {
    required bool hidden,
  }) {
    final size = MediaQuery.sizeOf(context);
    final body = size.width - shellNavigationExtentFor(size);
    _historySidebarAvailable =
        !hidden && body >= assistantHistorySidebarMinWidth;
    return _historySidebarAvailable && !_historySidebarCollapsed
        ? assistantHistorySidebarWidth(body)
        : 0;
  }

  /// The listed conversation matching the open chat, including a Live chat
  /// stored under its conversation id.
  String? _activeHistoryChatId(AssistantChatState state) {
    final selectedId = state.chat?.id ?? state.storedChatId;
    return state.history
        .where(
          (chat) =>
              chat.id == selectedId ||
              isSameAssistantLiveChat(chat.id, selectedId),
        )
        .firstOrNull
        ?.id;
  }

  void _selectHistoryChat(String wsId, AssistantChatRecord chat) {
    final guard = _remoteGuard(wsId);
    if (!guard.current) return;
    _dismissComposerInput();
    unawaited(_openHistoryChat(guard, wsId, chat));
  }

  Widget _buildHistorySidebar({
    required String wsId,
    required AssistantChatState chatState,
    required double headerHeight,
  }) => Material(
    type: MaterialType.transparency,
    child: AssistantHistorySidebar(
      history: chatState.history,
      status: chatState.historyStatus,
      activeChatId: _activeHistoryChatId(chatState),
      now: widget.conversationsClock?.call(),
      topInset: floatingShellHeaderInset(
        context,
        minimumContentHeight: headerHeight,
      ),
      onSelect: (chat) => _selectHistoryChat(wsId, chat),
      onOpenAll: () => unawaited(_openConversations(context, wsId)),
      onRetry: () => _chatCubit.refreshHistory(forceRefresh: true),
    ),
  );

  /// Recent conversations for the new-chat screen; null once history has
  /// loaded empty, so a first chat shows only the greeting and actions.
  Widget? _recentConversations(String wsId, AssistantChatState chatState) {
    if (chatState.history.isEmpty &&
        chatState.historyStatus == AssistantHistoryStatus.ready) {
      return null;
    }
    return AssistantRecentConversations(
      history: chatState.history,
      status: chatState.historyStatus,
      activeChatId: _activeHistoryChatId(chatState),
      now: widget.conversationsClock?.call(),
      onSelect: (chat) => _selectHistoryChat(wsId, chat),
      onSeeAll: () => unawaited(_openConversations(context, wsId)),
      onRetry: () => _chatCubit.refreshHistory(forceRefresh: true),
    );
  }

  Widget _historySplit({
    required double sidebarWidth,
    required Widget Function() sidebar,
    required Widget page,
  }) => Row(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      SizedBox(width: sidebarWidth, child: sidebarWidth > 0 ? sidebar() : null),
      Expanded(child: page),
    ],
  );
}
