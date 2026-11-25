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

  /// Whether this window shows the history sidebar beside the thread: a
  /// tablet-class window (shortest side of at least 600dp) whose body beside
  /// the shell navigation fits [assistantHistorySidebarMinWidth]. Phones keep
  /// the Conversations page, landscape included.
  bool _historySidebarFits(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final body = size.width - shellNavigationExtentFor(size);
    return size.shortestSide >= Breakpoints.mediumMin &&
        body >= assistantHistorySidebarMinWidth;
  }

  /// The thread beside the history sidebar when the window fits it. The
  /// sidebar takes the leading safe-area inset, so its rows clear a notch or
  /// camera housing, and the thread drops that inset. The tree keeps one
  /// shape either way, so toggling the sidebar never remounts the thread.
  Widget _historySplit({
    required BuildContext context,
    required bool hidden,
    required Widget Function() sidebar,
    required Widget Function(bool sidebarShown) page,
  }) {
    final shown =
        !hidden && !_historySidebarCollapsed && _historySidebarFits(context);
    final size = MediaQuery.sizeOf(context);
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final padding = MediaQuery.paddingOf(context);
    final start = shown ? (rtl ? padding.right : padding.left) : 0.0;
    final width = shown
        ? assistantHistorySidebarWidth(
                size.width - shellNavigationExtentFor(size),
              ) +
              start
        : 0.0;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          key: const ValueKey('assistant-history-sidebar-slot'),
          width: width,
          child: shown
              ? Padding(
                  padding: EdgeInsetsDirectional.only(start: start),
                  child: MediaQuery.removePadding(
                    context: context,
                    removeLeft: !rtl,
                    removeRight: rtl,
                    child: sidebar(),
                  ),
                )
              : null,
        ),
        Expanded(
          child: MediaQuery.removePadding(
            context: context,
            removeLeft: shown && !rtl,
            removeRight: shown && rtl,
            child: page(shown),
          ),
        ),
      ],
    );
  }
}
