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
          if (!await guard.run(
                () => dismissAdaptiveDrawerOverlay(drawerContext),
              ) ||
              !mounted) {
            return;
          }
          if (this.context.read<AssistantChromeCubit>().state.isLiveMode) {
            if (!await guard.run(_exitLiveMode) || !mounted) return;
          }
          await _startNewConversation(wsId, _chatCubit.state, _liveCubit.state);
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
