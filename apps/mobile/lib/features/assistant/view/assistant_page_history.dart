part of 'assistant_page.dart';

extension _AssistantPageHistory on _AssistantPageState {
  Future<void> _showHistorySheet(BuildContext context, String wsId) async {
    if (_localCubit.state.local || _localCubit.state.blocked) {
      _showInlineNotice(context.l10n.assistantLocalHistoryNotice);
      return;
    }
    final guard = AssistantRemoteScopeGuard(
      scope: _localScope,
      version: () => _localCubit.scopeVersion,
      remote: () =>
          mounted &&
          context.mounted &&
          _loadedWorkspaceId == wsId &&
          !_localCubit.state.local &&
          !_localCubit.state.blocked,
    );
    if (!await guard.run(_chatCubit.refreshHistory) || !context.mounted) return;
    await showAdaptiveDrawer(
      context: context,
      builder: (drawerContext) => AssistantHistorySheetBody(
        chatCubit: _chatCubit,
        activeChatId: _chatCubit.state.chat?.id,
        onClose: () => dismissAdaptiveDrawerOverlay(drawerContext),
        onNewConversation: () async {
          if (!guard.current) return;
          final reset = await _startNewConversation(
            wsId,
            _chatCubit.state,
            _liveCubit.state,
            historyContext: drawerContext,
          );
          if (reset != _AssistantNewChatResult.committed ||
              !guard.current ||
              !mounted) {
            return;
          }
          try {
            await guard.run(() => dismissAdaptiveDrawerOverlay(drawerContext));
          } on Object {
            if (guard.current && mounted) {
              await _showNewChatResetNotice(
                this.context.l10n.assistantNewChatResetCleanupFailed,
                historyContext: drawerContext.mounted ? drawerContext : null,
              );
            }
          }
        },
        onSelectChat: (chat) async {
          if (!await guard.run(
                () => dismissAdaptiveDrawerOverlay(drawerContext),
              ) ||
              !mounted) {
            return;
          }
          if (_liveCubit.state.chatId != null &&
              _liveCubit.state.chatId != chat.id) {
            if (!await guard.run(_liveCubit.disconnect) || !mounted) return;
          }
          if (!guard.current) return;
          if (this.context.read<AssistantChromeCubit>().state.isLiveMode) {
            if (!await guard.run(_exitLiveMode) || !mounted) return;
          }
          if (guard.current) await _chatCubit.openChat(wsId, chat);
        },
      ),
    );
  }

  Future<void> _showCreditSourceSheet(
    BuildContext context, {
    required AssistantShellState shellState,
    required bool isPersonalWorkspace,
  }) async {
    await showAdaptiveSheet<void>(
      context: context,
      builder: (sheetContext) => AssistantCreditSourceSheet(
        cubit: _shellCubit,
        isPersonalWorkspace: isPersonalWorkspace,
      ),
    );
  }
}
