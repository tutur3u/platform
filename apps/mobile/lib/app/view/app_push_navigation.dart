part of 'app.dart';

extension _AppPushNavigation on _AppState {
  Widget _showRevocationWarnings(Widget child) =>
      BlocListener<AuthCubit, AuthState>(
        listenWhen: (previous, current) =>
            current.revocationUnconfirmed && !previous.revocationUnconfirmed,
        listener: (context, state) => shad.showToast(
          context: context,
          location: shad.ToastLocation.topCenter,
          builder: (context, _) => AppAlert(
            variant: AppAlertVariant.warning,
            title: Text(context.l10n.authDeviceRevocationUnconfirmed),
          ),
        ),
        child: child,
      );

  Future<void> _stopAccountServices() async {
    // Stop private delivery and collection using the departing credentials.
    await PushNotificationService.instance.disableTelemetry();
    await ReminderService.instance.stopSession();
    await PushNotificationService.instance.stopSession();
  }

  Future<void> _restoreCurrentAccountServices() async {
    final userId = _authCubit.state.user?.id;
    if (!mounted ||
        userId == null ||
        _authCubit.state.status != AuthStatus.authenticated) {
      return;
    }
    unawaited(_startPushSession(userId));
    await ReminderService.instance.startWorkspaceSession(
      userId,
      _workspaceCubit.state,
    );
  }

  bool _recordAccountWorkspace(WorkspaceState state) {
    final userId = _authCubit.state.user?.id;
    final workspaceId = state.currentWorkspace?.id;
    if (userId == null ||
        workspaceId == null ||
        !_workspaceCubit.hasAuthenticatedActor ||
        workspaceId != _workspaceCubit.state.currentWorkspace?.id) {
      return false;
    }
    unawaited(ReminderService.instance.startWorkspaceSession(userId, state));
    unawaited(_authCubit.updateActiveAccountWorkspaceContext(workspaceId));
    return true;
  }

  Future<void> _loadWorkspacesWithReminders() async {
    final auth = _authCubit.state;
    final userId = auth.user?.id;
    final preferredWorkspace = auth.accounts
        .where((account) => account.id == userId)
        .firstOrNull
        ?.lastWorkspaceId;
    await _workspaceCubit.loadWorkspaces(
      preferredWorkspaceId: preferredWorkspace,
    );
    if (!mounted || userId != _authCubit.state.user?.id) return;
    _syncOfflinePreparationScope();
    if (userId != null) {
      await ReminderService.instance.startWorkspaceSession(
        userId,
        _workspaceCubit.state,
      );
    }
  }

  void _handleLifecycleState(AppLifecycleState state) {
    _mobileFlags.setForeground(foreground: state == AppLifecycleState.resumed);
    _mastermind.irisLifecycle(state);
    if (state == AppLifecycleState.paused ||
        (state == AppLifecycleState.inactive &&
            _appLockCubit.state.delay != AppLockDelay.immediately) ||
        state == AppLifecycleState.hidden) {
      _backgroundedAt ??= DateTime.now();
      return;
    }
    if (state != AppLifecycleState.resumed) return;
    // Phases that ended while the app slept are settled before anything
    // else reads the Pomodoro.
    unawaited(_pomodoroController.reconcile());
    unawaited(PushNotificationService.instance.refreshRegistration());

    final backgroundedAt = _backgroundedAt;
    _backgroundedAt = null;
    if (backgroundedAt != null &&
        DateTime.now().difference(backgroundedAt) >=
            _appLockCubit.state.delay.duration &&
        _authCubit.state.status == AuthStatus.authenticated &&
        !isAppLockExcludedRoute(_router.currentMatchedLocation)) {
      _appLockCubit.lock();
    }

    unawaited(
      _mastermind.retryAccessAfterError(
        _workspaceCubit.state.currentWorkspace?.id,
      ),
    );
    unawaited(_refreshOfflinePreparationOnResume());
    unawaited(_appVersionCubit.checkVersion(background: true));
    unawaited(CacheWarmupCoordinator.instance.prewarmHome());
    unawaited(_shellProfileCubit.refreshIfStale(_authCubit.state.user));
    unawaited(ReminderService.instance.refreshIfStale());
  }

  Future<void> _handlePushNavigation(PushNavigationRequest request) async {
    if (request.userId != null && request.userId != _authCubit.state.user?.id) {
      return;
    }
    if (request.opensMfaApproval) {
      if (request.userId == _authCubit.state.user?.id) {
        _router.go(
          Uri(
            path: Routes.settingsMfaApproval,
            queryParameters: {
              'challengeId': request.entityId,
              'userId': request.userId,
            },
          ).toString(),
        );
        unawaited(archiveOpenedNotification(request.notificationId));
      }
      return;
    }
    final mastermindLocation = request.mastermindLocation;
    if (mastermindLocation != null) {
      // The router's Mastermind access gate still holds the tab roots.
      _router.go(mastermindLocation);
      return;
    }
    if (request.openTarget == 'mail') {
      final destination = request.mailDestination;
      if (destination != null &&
          destination.userId == _authCubit.state.user?.id) {
        _router.go(destination.location);
      }
      return;
    }
    final targetWorkspaceId = request.wsId;
    if (targetWorkspaceId != null &&
        targetWorkspaceId.isNotEmpty &&
        _workspaceCubit.state.currentWorkspace?.id != targetWorkspaceId) {
      if (_workspaceCubit.state.workspaces.isEmpty) {
        await _workspaceCubit.loadWorkspaces();
      }
      Workspace? targetWorkspace;
      for (final workspace in _workspaceCubit.state.workspaces) {
        if (workspace.id == targetWorkspaceId) {
          targetWorkspace = workspace;
          break;
        }
      }
      if (targetWorkspace == null) {
        _router.go(Routes.notifications);
        return;
      }
      await _workspaceCubit.selectWorkspace(targetWorkspace);
    }
    // A device Pomodoro phase ended; the Timer shows what is next.
    if (request.openTarget == 'timer') {
      _router.go(Routes.timer);
      return;
    }
    if (request.opensTask) {
      _router.go(
        taskBoardDetailLocation(
          boardId: request.boardId!,
          taskId: request.entityId!,
        ),
      );
      unawaited(archiveOpenedNotification(request.notificationId));
      return;
    }
    if (request.openTarget == 'calendar' &&
        request.entityId != null &&
        request.entityId!.isNotEmpty) {
      _router.go(Routes.calendarEventDetailPath(request.entityId!));
      unawaited(archiveOpenedNotification(request.notificationId));
      return;
    }
    if (request.opensChat) {
      _router.go(
        request.conversationId == null
            ? Routes.chat
            : Routes.chatConversationPath(request.conversationId!),
      );
      unawaited(archiveOpenedNotification(request.notificationId));
      return;
    }
    _router.go(Routes.notifications);
  }
}

final class _AppLifecycleObserver extends WidgetsBindingObserver {
  _AppLifecycleObserver(this._onStateChanged);

  final ValueChanged<AppLifecycleState> _onStateChanged;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _onStateChanged(state);
  }
}
