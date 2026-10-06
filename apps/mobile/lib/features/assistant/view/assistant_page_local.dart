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

  Widget _localStatus(AssistantLocalChatState state) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        state.local
            ? context.l10n.assistantLocalMode(
                _localModelLabel(state.selectedModelId)!,
              )
            : context.l10n.assistantLocalLoading,
      ),
      if (state.failure != null) Text(_localNotice(state.failure)),
      const SizedBox(height: 12),
    ],
  );

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
