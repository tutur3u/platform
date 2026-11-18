part of 'assistant_page.dart';

extension _AssistantPageHistory on _AssistantPageState {
  Future<void> _dismissHistory(BuildContext context) async {
    if (!context.mounted || ModalRoute.of(context)?.isCurrent != true) {
      throw StateError('Assistant history sheet is no longer active');
    }
    Navigator.of(context).pop();
  }

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
    if (_usesPageComposer) {
      if (!guard.current || widget.shellLocation != Routes.assistant) return;
      _collapseComposerToFab();
      context.go(Routes.assistantConversations);
      unawaited(guard.run(_chatCubit.refreshHistory));
      return;
    }
    if (!await guard.run(_chatCubit.refreshHistory) || !context.mounted) return;
    await showAppSheet<void>(
      size: AppSheetSize.large,
      context: context,
      builder: (drawerContext) => AssistantHistorySheetBody(
        chatCubit: _chatCubit,
        activeChatId: _chatCubit.state.chat?.id,
        onClose: () => _dismissHistory(drawerContext),
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
            await guard.run(() => _dismissHistory(drawerContext));
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
          if (!await guard.run(() => _dismissHistory(drawerContext)) ||
              !mounted) {
            return;
          }
          await _openHistoryChat(guard, wsId, chat);
        },
      ),
    );
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
                        : context.l10n.assistantHistoryEmpty,
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
                if (current()) await _chatCubit.refreshHistory();
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
                  return await guard.run(
                    () => _repository.archiveHistoryChat(wsId, chat),
                  );
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
