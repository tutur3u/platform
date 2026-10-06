part of 'assistant_page.dart';

extension _AssistantPageLocal on _AssistantPageState {
  Object? _localScope() {
    final actor = _currentActor();
    if (actor == null || _loadedWorkspaceId == null) return null;
    return (
      actor: actor,
      workspace: _loadedWorkspaceId,
      epoch: _voiceActorScopeEpoch,
    );
  }

  AssistantRemoteScopeGuard _remoteGuard(String wsId) =>
      AssistantRemoteScopeGuard(
        scope: _localScope,
        version: () => _localCubit.scopeVersion,
        remote: () =>
            mounted &&
            _appIsForeground &&
            _loadedWorkspaceId == wsId &&
            !_localCubit.state.local &&
            !_localCubit.state.blocked,
      );

  AssistantRemoteScopeGuard _remoteOperationGuard(String wsId) =>
      AssistantRemoteScopeGuard(
        scope: _localScope,
        version: () => _localCubit.selectionVersion,
        remote: () =>
            mounted &&
            _loadedWorkspaceId == wsId &&
            !_localCubit.selectedLocalMode,
      );

  void _resumeLocal() {
    if (!_appIsForeground ||
        !TickerMode.valuesOf(context).enabled ||
        _localCubit.scopeCurrent) {
      return;
    }
    final actor = _currentActor();
    final workspace = _loadedWorkspaceId;
    if (actor != null && workspace != null) {
      unawaited(_syncLocal(actor, workspace));
    }
  }

  Future<void> _syncLocal(String actor, String workspace) async {
    final scope = _localScope();
    // Runtime hydration blocks new interactions, but an admitted remote reply
    // keeps its actor/workspace/mode lease through a transient foreground pause.
    await _localCubit.syncWorkspace(actor, workspace);
    if (!mounted || scope == null || scope != _localScope()) return;
    if (!mounted || !_localCubit.scopeCurrent || !_localCubit.state.local) {
      return;
    }
    await _chatCubit.stopStreaming(discardQueued: true);
    if (!mounted || scope != _localScope()) return;
    await _voiceCapture.cancel();
    await _liveCubit.disconnect();
    if (mounted && _localCubit.scopeCurrent) {
      context.read<AssistantChromeCubit>().exitLiveMode();
    }
  }

  Widget _localHeader(
    AssistantShellState shell,
    AssistantLocalChatState state,
  ) {
    final scope = _localScope();
    final selection = _localCubit.selectionVersion;
    final localLane = state.local || state.blocked;
    final label = state.failure != null
        ? context.l10n.assistantLocalHeaderIssue
        : state.ready
        ? context.l10n.assistantLocalHeaderReady
        : context.l10n.assistantLocalHeaderPreparing;
    return ShellTitleOverride(
      ownerId: 'assistant-model-status',
      locations: const {Routes.assistant},
      title: scope == null || shell.soul.name.trim().isEmpty
          ? 'Mira'
          : shell.soul.name,
      titleActionToken: (scope, identityHashCode(_shellCubit)),
      onTitleSubmitted: scope == null
          ? null
          : (name) async {
              if (!mounted || scope != _localScope()) {
                throw StateError('Assistant name scope changed');
              }
              await _shellCubit.renameAssistant(name);
            },
      subtitle: localLane && scope != null ? label : null,
      subtitleActionToken: (scope, selection, state.failure, state.ready),
      onSubtitlePressed: localLane && scope != null
          ? () {
              if (!mounted ||
                  scope != _localScope() ||
                  selection != _localCubit.selectionVersion) {
                return;
              }
              unawaited(_showLocalStatus(scope, selection));
            }
          : null,
    );
  }

  Future<void> _showLocalStatus(Object scope, int selection) async {
    bool current() =>
        mounted &&
        scope == _localScope() &&
        selection == _localCubit.selectionVersion;
    if (!current()) return;
    await showAdaptiveSheet<void>(
      context: context,
      builder: (sheetContext) =>
          BlocBuilder<AssistantLocalChatCubit, AssistantLocalChatState>(
            bloc: _localCubit,
            builder: (_, state) => !current()
                ? const SizedBox.shrink()
                : AssistantLocalStatusSheet(
                    modelLabel: _localModelLabel(state.selectedModelId),
                    notice: state.failure == null
                        ? null
                        : _localNotice(state.failure),
                    preparing: state.transitioning,
                    onManage: () {
                      if (!current()) return;
                      Navigator.of(sheetContext).pop();
                      unawaited(_showLiveSettings());
                    },
                  ),
          ),
    );
  }

  Future<void> _sendLocal() async {
    final state = _localCubit.state;
    if (!_localCubit.scopeCurrent ||
        !state.ready ||
        state.phase != LocalChatPhase.idle) {
      _showInlineNotice(_localNotice(state.failure));
      return;
    }
    final text = _inputController.text;
    if (text.trim().isEmpty) return;
    if (text.trim().length > 6000) {
      _showInlineNotice(context.l10n.assistantLocalInputError);
      return;
    }
    final sending = _localCubit.send(text);
    _inputController.clear();
    _scheduleScrollToBottom();
    await sending;
  }

  String _localNotice(LocalChatFailure? failure) => switch (failure) {
    LocalChatFailure.unsupported => context.l10n.assistantLocalHardware,
    LocalChatFailure.missingModel => context.l10n.assistantLocalMissing,
    LocalChatFailure.engine => context.l10n.assistantLocalEngineError,
    LocalChatFailure.storage => context.l10n.assistantLocalStorageError,
    LocalChatFailure.input => context.l10n.assistantLocalInputError,
    null => context.l10n.assistantLocalLoading,
  };

  Future<void> _retryRemote(AssistantShellState shell) async {
    final wsId = shell.workspace?.id ?? '';
    final guard = _remoteGuard(wsId);
    final operation = _remoteOperationGuard(wsId);
    await retryAssistantChat(
      _chatCubit,
      shell,
      isCurrent: () => guard.current,
      isOperationCurrent: () => operation.current,
    );
  }

  Future<void> _selectRemoteModel(AssistantGatewayModel model) async {
    final scope = _localScope();
    final selectedVersion = _localCubit.scopeVersion + 1;
    await _localCubit.select(null);
    if (!mounted ||
        scope != _localScope() ||
        selectedVersion != _localCubit.scopeVersion ||
        _localCubit.state.blocked ||
        _localCubit.state.local) {
      return;
    }
    await _shellCubit.setSelectedModel(model);
  }

  String? _localModelLabel(String? id) {
    for (final model in assistantLocalModels) {
      if (model.id == id) return model.name;
    }
    return id == null ? null : context.l10n.assistantLocalSelectionUnknown;
  }
}
