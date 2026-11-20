part of 'assistant_page.dart';

extension _AssistantPageWorkspace on _AssistantPageState {
  void _syncWorkspace(Workspace workspace) {
    if (workspace.id == _loadedWorkspaceId) {
      return;
    }

    ++_voiceActorScopeEpoch;
    _dismissLiveCall();
    unawaited(_voiceCapture.cancel());
    _loadedWorkspaceId = workspace.id;
    final actor = _currentActor();
    if (actor != null) {
      unawaited(_syncLocal(actor, workspace.id));
    } else {
      unawaited(_localCubit.invalidate());
    }
    _keepLiveWhileBrowsing = false;
    _liveBrowsingPreferenceLoad = _loadLiveBrowsingPreference(workspace.id);
    _lastEmptyStateResetKey = null;
    _wasAssistantEmptyLayout = false;
    _showScrollToBottomFab = false;
    if (mounted) {
      context.read<AssistantChromeCubit>().exitLiveMode();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || _loadedWorkspaceId != workspace.id) return;
        _inputController.clear();
        _dismissKeyboard();
      });
    }
    final previousDisconnect = _workspaceDisconnect;
    _workspaceDisconnect = () async {
      await previousDisconnect;
      await _liveCubit.disconnect();
    }();
    unawaited(_shellCubit.loadWorkspace(workspace));
    if (actor != null) {
      unawaited(
        _liveEligibilityCubit.ensure(actorId: actor, wsId: workspace.id),
      );
    }
    _shellCubit.setImmersiveMode(false);
    unawaited(_chatCubit.loadWorkspace(workspace.id));
  }
}
