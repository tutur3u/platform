part of 'app.dart';

/// Binds Siri/Shortcuts and Android launcher shortcuts to the Assistant.
extension _AppAssistantLaunch on _AppState {
  void _initializeAssistantLaunch() {
    _assistantLaunchActor = _authCubit.state.status == AuthStatus.authenticated
        ? _authCubit.state.user?.id
        : null;
    _assistantLaunchHost = AssistantLaunchHost(
      currentActor: () => _authCubit.state.status == AuthStatus.authenticated
          ? _authCubit.state.user?.id
          : null,
      // Not resumed counts as locked: the resume handler evaluates the app
      // lock first and then re-runs delivery.
      appLocked: () =>
          WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed ||
          !_appLockCubit.state.hasLoaded ||
          _appLockCubit.state.locked,
      workspace: () {
        final state = _workspaceCubit.state;
        if (state.currentWorkspace != null) {
          return AssistantLaunchWorkspace.ready;
        }
        if (state.status == WorkspaceStatus.initial ||
            state.status == WorkspaceStatus.loading) {
          return AssistantLaunchWorkspace.loading;
        }
        return state.personalWorkspaceOrCurrent != null
            ? AssistantLaunchWorkspace.ready
            : AssistantLaunchWorkspace.missing;
      },
      openAssistant: () => _router.go(Routes.assistant),
      openWorkspacePicker: () => _router.go(Routes.workspaceSelect),
    );
    AssistantLaunchCoordinator.instance.bind(_assistantLaunchHost);
    if (AssistantLaunchChannel.supported) {
      final channel = _assistantLaunchChannel = AssistantLaunchChannel();
      unawaited(channel.start());
    }
  }

  void _syncAssistantLaunchActor() {
    final next = _authCubit.state.status == AuthStatus.authenticated
        ? _authCubit.state.user?.id
        : null;
    final previous = _assistantLaunchActor;
    _assistantLaunchActor = next;
    AssistantLaunchCoordinator.instance.onActorChanged(
      previous: previous,
      next: next,
    );
  }

  void _disposeAssistantLaunch() {
    _assistantLaunchChannel?.stop();
    AssistantLaunchCoordinator.instance.unbind(_assistantLaunchHost);
  }
}
