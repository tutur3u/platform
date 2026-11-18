part of 'assistant_page.dart';

extension _AssistantPageHistory on _AssistantPageState {
  Future<void> _returnFromConversations() async {
    if (mounted && _showsConversations) context.go(Routes.assistant);
  }

  Future<void> _openConversations(BuildContext context, String wsId) async {
    if (_localCubit.state.local || _localCubit.state.blocked) {
      _showInlineNotice(context.l10n.assistantLocalHistoryNotice);
      return;
    }
    if (!_remoteGuard(wsId).current || _showsConversations) return;
    _dismissComposerInput();
    context.go(Routes.assistantConversations);
  }

  Future<void> _openHistoryChat(
    AssistantRemoteScopeGuard guard,
    String wsId,
    AssistantChatRecord chat,
  ) async {
    if (_liveCubit.state.chatId != null && _liveCubit.state.chatId != chat.id) {
      if (!await guard.run(_liveCubit.disconnect) || !mounted) return;
    }
    if (!guard.current) return;
    if (context.read<AssistantChromeCubit>().state.isLiveMode) {
      if (!await guard.run(_exitLiveMode) || !mounted) return;
    }
    if (guard.current) await _chatCubit.openChat(wsId, chat);
  }

  Widget _buildConversationsPage() {
    return BlocBuilder<AssistantLocalChatCubit, AssistantLocalChatState>(
      bloc: _localCubit,
      builder: (context, local) {
        final auth = context.watch<AuthCubit>().state;
        final workspace = context.watch<WorkspaceCubit>().state;
        final wsId =
            (workspace.currentWorkspace ?? workspace.personalWorkspaceOrCurrent)
                ?.id;
        return BlocBuilder<AssistantChatCubit, AssistantChatState>(
          bloc: _chatCubit,
          builder: (context, state) {
            if (wsId == null ||
                state.workspaceId != wsId ||
                local.blocked ||
                local.local ||
                _localScope() == null) {
              return AppScaffold(
                backgroundColor: AppTokens.of(context).colorScheme.background,
                child: Center(
                  child: Text(
                    local.local || local.blocked
                        ? context.l10n.assistantLocalHistoryNotice
                        : context.l10n.commonLoading,
                  ),
                ),
              );
            }
            final guard = _remoteGuard(wsId);
            bool current() =>
                context.mounted && _showsConversations && guard.current;
            bool canArchive(AssistantChatRecord chat) {
              final state = _chatCubit.state;
              return _repository.canArchiveHistoryChat(chat) &&
                  ![
                    state.chat?.id,
                    state.storedChatId,
                    state.fallbackChatId,
                    _liveCubit.state.chatId,
                  ].any((id) => isSameAssistantLiveChat(chat.id, id));
            }

            final selectedId = state.chat?.id ?? state.storedChatId;
            return AssistantConversations(
              key: ValueKey((auth.user?.id, wsId)),
              history: state.history,
              status: state.historyStatus,
              now: widget.conversationsClock?.call(),
              activeChatId: state.history
                  .where(
                    (chat) =>
                        chat.id == selectedId ||
                        isSameAssistantLiveChat(chat.id, selectedId),
                  )
                  .firstOrNull
                  ?.id,
              onRefresh: () async {
                if (current()) {
                  await _chatCubit.refreshHistory(forceRefresh: true);
                }
              },
              onSelect: (chat) {
                if (!current()) return;
                context.go(Routes.assistant);
                unawaited(_openHistoryChat(guard, wsId, chat));
              },
              canArchive: canArchive,
              onArchive: (chat) async {
                if (!current() || !canArchive(chat)) return false;
                try {
                  if (!await guard.run(
                    () => _repository.archiveHistoryChat(wsId, chat),
                  )) {
                    return false;
                  }
                  _chatCubit.removeArchivedChat(chat);
                  unawaited(_chatCubit.refreshHistory(forceRefresh: true));
                  return true;
                } on Exception {
                  if (context.mounted && current()) {
                    showAppToast(
                      context,
                      message: context.l10n.assistantArchiveConversationFailed,
                    );
                  }
                  return false;
                }
              },
              onNewConversation: (historyContext) async {
                if (!current()) return;
                final reset = await _startNewConversation(
                  wsId,
                  _chatCubit.state,
                  _liveCubit.state,
                  historyContext: historyContext,
                );
                if (context.mounted &&
                    current() &&
                    reset == _AssistantNewChatResult.committed) {
                  context.go(Routes.assistant);
                }
              },
            );
          },
        );
      },
    );
  }

  Future<void> _showCreditSourceSheet(
    BuildContext context, {
    required AssistantShellState shellState,
    required bool isPersonalWorkspace,
  }) async {
    await showAppSheet<void>(
      context: context,
      builder: (sheetContext) => AssistantCreditSourceSheet(
        cubit: _shellCubit,
        isPersonalWorkspace: isPersonalWorkspace,
      ),
    );
  }
}
