part of 'app.dart';

extension _AppPushNavigation on _AppState {
  Widget _showRevocationWarnings(Widget child) =>
      BlocListener<AuthCubit, AuthState>(
        listenWhen: (previous, current) =>
            current.revocationUnconfirmed && !previous.revocationUnconfirmed,
        listener: (context, state) {
          // Present the warning under the account scope for the new frame.
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!context.mounted) return;
            shad.showToast(
              context: context,
              location: shad.ToastLocation.topCenter,
              builder: (context, _) => AppAlert(
                variant: AppAlertVariant.warning,
                title: Text(context.l10n.authDeviceRevocationUnconfirmed),
              ),
            );
          });
        },
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

  void _registerAppLockLifecycle() {
    _appLockLifecycle = AppLockLifecycle(
      lock: _appLockCubit,
      accountIdentity: () => _authCubit.state.user?.id,
      onSuspend: (state) {
        _mobileFlags.setForeground(foreground: false);
        _mastermind.irisLifecycle(state);
      },
      refresh: _refreshAfterResume,
    );
    _unbindSmartSync = SmartSyncRuntime.bind(
      currentUserId: () => mounted ? _authCubit.state.user?.id : null,
      currentWorkspaceId: () => _workspaceCubit.state.currentWorkspace?.id,
      workspaceChanges: _workspaceCubit.stream.map(
        (state) => state.currentWorkspace?.id,
      ),
    );
  }

  void _refreshAfterResume() {
    final actor = _authCubit.state.user?.id;
    SmartSyncRuntime.resume(
      signedIn: () =>
          mounted && actor != null && _authCubit.state.user?.id == actor,
    );
    _mobileFlags.setForeground(foreground: true);
    _mastermind.irisLifecycle(AppLifecycleState.resumed);
    unawaited(_pomodoroController.reconcile());
    unawaited(PushNotificationService.instance.refreshRegistration());

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
      _mastermind.refreshFleet();
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
