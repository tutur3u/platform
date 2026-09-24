part of 'app.dart';

extension _AppPushNavigation on _AppState {
  Future<void> _handlePushNavigation(PushNavigationRequest request) async {
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
