part of 'assistant_page.dart';

extension _AssistantPageWorkspace on _AssistantPageState {
  void _syncWorkspace(Workspace workspace) {
    if (workspace.id == _loadedWorkspaceId) {
      return;
    }

    ++_voiceActorScopeEpoch;
    unawaited(_voiceCapture.cancel());
    _loadedWorkspaceId = workspace.id;
    _keepLiveWhileBrowsing = false;
    _liveBrowsingPreferenceLoad = _loadLiveBrowsingPreference(workspace.id);
    _lastEmptyStateResetKey = null;
    _wasAssistantEmptyLayout = false;
    _isComposerVisible = false;
    _showScrollToBottomFab = false;
    _composerVisibilityAnchorOffset = null;
    if (mounted) {
      context.read<AssistantChromeCubit>()
        ..setComposerVisible(visible: false)
        ..exitLiveMode();
      // The composer is a shell sibling, so changing its controller during
      // this page's build would dirty an unrelated branch mid-layout.
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
    _shellCubit.setImmersiveMode(false);
    unawaited(_chatCubit.loadWorkspace(workspace.id));
  }
}
