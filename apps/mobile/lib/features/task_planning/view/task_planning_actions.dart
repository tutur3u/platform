part of 'task_planning_page.dart';

extension _TaskPlanningActions on _TaskPlanningViewState {
  Future<void> _loadPermissions() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    final capturedWsId = wsId;
    final currentUserId = context.read<AuthCubit>().state.user?.id;
    final capturedUserId = currentUserId;

    if (!mounted) return;
    _updateState(() => _isCheckingPermissions = true);

    if (wsId == null || currentUserId == null) {
      if (!_canUpdatePermissionsState(capturedWsId, capturedUserId)) return;
      _updateState(() {
        _canManageProjects = false;
        _isCheckingPermissions = false;
        _hasResolvedPermissions = true;
      });
      return;
    }

    try {
      final permissions = await _permissionsRepository.getPermissions(
        wsId: wsId,
        userId: currentUserId,
      );
      if (!_canUpdatePermissionsState(capturedWsId, capturedUserId)) return;
      _updateState(() {
        _canManageProjects = permissions.containsPermission('manage_projects');
        _isCheckingPermissions = false;
        _hasResolvedPermissions = true;
      });
    } on Exception {
      if (!_canUpdatePermissionsState(capturedWsId, capturedUserId)) return;
      _updateState(() {
        _canManageProjects = false;
        _isCheckingPermissions = false;
        _hasResolvedPermissions = true;
      });
    }
  }

  bool _canUpdatePermissionsState(
    String? capturedWsId,
    String? capturedUserId,
  ) {
    if (!mounted) return false;

    final currentWsId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    final latestUserId = context.read<AuthCubit>().state.user?.id;
    return currentWsId == capturedWsId && latestUserId == capturedUserId;
  }

  Future<void> _reload() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    switch (_activeTab) {
      case _TaskPlanningTab.estimates:
        await context.read<TaskEstimatesCubit>().loadBoards(wsId);
      case _TaskPlanningTab.labels:
        await context.read<TaskLabelsCubit>().loadLabels(
          wsId,
          forceRefresh: true,
        );
      case _TaskPlanningTab.projects:
      case _TaskPlanningTab.initiatives:
        await context.read<TaskPortfolioCubit>().load(wsId, forceRefresh: true);
    }
  }

  Future<void> _openCreateLabel() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    final l10n = context.l10n;
    final rootNavigator = Navigator.of(context, rootNavigator: true);
    final created = await showAdaptiveSheet<bool>(
      context: context,
      useRootNavigator: true,
      builder: (_) => TaskLabelDialog(
        title: l10n.taskLabelsCreate,
        submitLabel: l10n.taskLabelsCreate,
        onSubmit: (value) async {
          try {
            await context.read<TaskLabelsCubit>().createLabel(
              wsId: wsId,
              name: value.name,
              color: value.color,
            );
            return true;
          } on ApiException catch (error) {
            if (!mounted || !rootNavigator.mounted) return false;
            final message = error.message.isNotEmpty
                ? error.message
                : l10n.commonSomethingWentWrong;
            shad.showToast(
              context: rootNavigator.context,
              builder: (_, overlay) => shad.Alert.destructive(
                title: Text(l10n.commonSomethingWentWrong),
                content: Text(message),
              ),
            );
            return false;
          } on Exception {
            if (!mounted || !rootNavigator.mounted) return false;
            shad.showToast(
              context: rootNavigator.context,
              builder: (_, overlay) => shad.Alert.destructive(
                content: Text(l10n.commonSomethingWentWrong),
              ),
            );
            return false;
          }
        },
      ),
    );

    if (created != true || !mounted || !rootNavigator.mounted) return;

    shad.showToast(
      context: rootNavigator.context,
      builder: (_, overlay) =>
          shad.Alert(content: Text(l10n.taskLabelsCreated)),
    );
    _selectTab(_TaskPlanningTab.labels);
  }

  Future<void> _openEditLabel(TaskLabel label) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    final l10n = context.l10n;
    final rootNavigator = Navigator.of(context, rootNavigator: true);
    final updated = await showAdaptiveSheet<bool>(
      context: context,
      useRootNavigator: true,
      builder: (_) => TaskLabelDialog(
        title: l10n.taskLabelsEdit,
        submitLabel: l10n.timerSave,
        initialName: label.name,
        initialColor: label.color,
        onSubmit: (value) async {
          try {
            await context.read<TaskLabelsCubit>().updateLabel(
              wsId: wsId,
              labelId: label.id,
              name: value.name,
              color: value.color,
            );
            return true;
          } on ApiException catch (error) {
            if (!mounted || !rootNavigator.mounted) return false;
            final message = error.message.isNotEmpty
                ? error.message
                : l10n.commonSomethingWentWrong;
            shad.showToast(
              context: rootNavigator.context,
              builder: (_, overlay) => shad.Alert.destructive(
                title: Text(l10n.commonSomethingWentWrong),
                content: Text(message),
              ),
            );
            return false;
          } on Exception {
            if (!mounted || !rootNavigator.mounted) return false;
            shad.showToast(
              context: rootNavigator.context,
              builder: (_, overlay) => shad.Alert.destructive(
                content: Text(l10n.commonSomethingWentWrong),
              ),
            );
            return false;
          }
        },
      ),
    );

    if (updated != true || !mounted || !rootNavigator.mounted) return;

    shad.showToast(
      context: rootNavigator.context,
      builder: (_, overlay) =>
          shad.Alert(content: Text(l10n.taskLabelsUpdated)),
    );
  }

  Future<void> _deleteLabel(TaskLabel label) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    final rootNavigator = Navigator.of(context, rootNavigator: true);
    final deleted =
        await showAdaptiveSheet<bool>(
          context: context,
          useRootNavigator: true,
          builder: (_) => AsyncDeleteConfirmationDialog(
            title: context.l10n.taskLabelsDelete,
            message: context.l10n.taskLabelsDeleteConfirm,
            cancelLabel: context.l10n.commonCancel,
            confirmLabel: context.l10n.taskLabelsDelete,
            toastContext: rootNavigator.context,
            onConfirm: () {
              return context.read<TaskLabelsCubit>().deleteLabel(
                wsId: wsId,
                labelId: label.id,
              );
            },
          ),
        ) ??
        false;

    if (!deleted || !mounted || !rootNavigator.mounted) return;
    shad.showToast(
      context: rootNavigator.context,
      builder: (_, overlay) =>
          shad.Alert(content: Text(context.l10n.taskLabelsDeleted)),
    );
  }

  Future<void> _openCreateProject() async {
    await _portfolioActions.openCreateProject();
  }

  Future<void> _openEditProject(TaskProjectSummary project) async {
    await _portfolioActions.openEditProject(project);
  }

  Future<void> _deleteProject(TaskProjectSummary project) async {
    await _portfolioActions.deleteProject(project);
  }

  Future<void> _openCreateInitiative() async {
    await _portfolioActions.openCreateInitiative();
  }

  Future<void> _openEditInitiative(TaskInitiativeSummary initiative) async {
    await _portfolioActions.openEditInitiative(initiative);
  }

  Future<void> _deleteInitiative(TaskInitiativeSummary initiative) async {
    await _portfolioActions.deleteInitiative(initiative);
  }

  Future<void> _manageInitiativeProjects(
    TaskInitiativeSummary initiative,
  ) async {
    await _portfolioActions.manageInitiativeProjects(initiative);
  }
}
