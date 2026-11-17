part of 'task_settings_section_page.dart';

extension _TaskSettingsSectionActions on _TaskSettingsSectionViewState {
  Future<void> _reload() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    await reloadTaskSettingsData(context, wsId, forceRefresh: true);
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
            showAppToast(
              rootNavigator.context,
              title: l10n.commonSomethingWentWrong,
              message: message,
              variant: AppAlertVariant.destructive,
            );
            return false;
          } on Exception {
            if (!mounted || !rootNavigator.mounted) return false;
            showAppToast(
              rootNavigator.context,
              message: l10n.commonSomethingWentWrong,
              variant: AppAlertVariant.destructive,
            );
            return false;
          }
        },
      ),
    );

    if (created != true || !mounted || !rootNavigator.mounted) return;

    showAppToast(rootNavigator.context, message: l10n.taskLabelsCreated);
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
            showAppToast(
              rootNavigator.context,
              title: l10n.commonSomethingWentWrong,
              message: message,
              variant: AppAlertVariant.destructive,
            );
            return false;
          } on Exception {
            if (!mounted || !rootNavigator.mounted) return false;
            showAppToast(
              rootNavigator.context,
              message: l10n.commonSomethingWentWrong,
              variant: AppAlertVariant.destructive,
            );
            return false;
          }
        },
      ),
    );

    if (updated != true || !mounted || !rootNavigator.mounted) return;

    showAppToast(rootNavigator.context, message: l10n.taskLabelsUpdated);
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
    showAppToast(
      rootNavigator.context,
      message: context.l10n.taskLabelsDeleted,
    );
  }

  Future<void> _openEditProject(TaskProjectSummary project) async {
    await _portfolioActions.openEditProject(project);
  }

  Future<void> _deleteProject(TaskProjectSummary project) async {
    await _portfolioActions.deleteProject(project);
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
