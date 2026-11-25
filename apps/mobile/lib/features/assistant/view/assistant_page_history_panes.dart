part of 'assistant_page.dart';

/// History surfaces inside the Mira page: the wide-screen sidebar beside the
/// thread and the recent conversations on the new-chat screen.
extension _AssistantPageHistoryPanes on _AssistantPageState {
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

  /// The thread beside the history sidebar when the page's own width
  /// fits both. Sized from the page constraints rather than the window, so
  /// the split holds wherever the shell places the page. Records whether the
  /// sidebar fits, so the history action toggles it there instead of opening
  /// the Conversations page.
  Widget _historySplit({
    required bool hidden,
    required Widget Function() sidebar,
    required Widget Function(bool sidebarShown) page,
  }) => LayoutBuilder(
    builder: (context, constraints) {
      final width = constraints.maxWidth;
      _historySidebarAvailable =
          !hidden && width >= assistantHistorySidebarMinWidth;
      final shown = _historySidebarAvailable && !_historySidebarCollapsed;
      final sidebarWidth = shown ? assistantHistorySidebarWidth(width) : 0.0;
      return Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(width: sidebarWidth, child: shown ? sidebar() : null),
          Expanded(child: page(shown)),
        ],
      );
    },
  );
}
