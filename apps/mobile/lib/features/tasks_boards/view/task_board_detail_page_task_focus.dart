part of 'task_board_detail_page.dart';

/// "Start focus" from a task row.
///
/// There is no Pomodoro entry point for a task yet (planned for phase 6), so
/// this starts an ordinary time-tracking session linked to the task through
/// the existing tracker API. Starting a session closes any running one on
/// the server, so a running timer is only replaced after confirmation.
extension _TaskFocusActions on _TaskBoardDetailPageViewState {
  Future<void> _startTaskFocus(BuildContext context, TaskBoardTask task) async {
    final wsId = context.read<TaskBoardDetailCubit>().state.workspaceId;
    if (wsId == null) return;
    final repository = context.read<ITimeTrackerRepository>();
    final router = GoRouter.maybeOf(context);
    // showAppToast needs a context below the root overlay.
    final toastContext = context;
    final l10n = context.l10n;
    final title = task.name?.trim().isNotEmpty == true
        ? task.name!.trim()
        : l10n.taskBoardDetailUntitledTask;

    void showError(String? message) {
      if (!toastContext.mounted) return;
      showAppToast(
        toastContext,
        message: message?.trim().isNotEmpty == true
            ? message!
            : l10n.commonSomethingWentWrong,
        variant: AppAlertVariant.destructive,
      );
    }

    try {
      final running = await repository.getRunningSession(wsId);
      if (!context.mounted) return;
      if (running != null && running.taskId != task.id) {
        final confirmed = await showAppConfirmDialog(
          context: context,
          title: l10n.taskBoardDetailFocusReplaceTitle,
          message: l10n.taskBoardDetailFocusReplaceMessage,
          confirmLabel: l10n.taskBoardDetailFocusReplaceConfirm,
          cancelLabel: l10n.commonCancel,
        );
        if (!confirmed || !context.mounted) return;
      }
      if (running == null || running.taskId != task.id) {
        await repository.startSession(wsId, title: title, taskId: task.id);
      }
      if (!toastContext.mounted) return;
      showAppToast(
        toastContext,
        message: l10n.taskBoardDetailFocusStarted,
        actionLabel: l10n.taskBoardDetailOpenTimer,
        onAction: router == null
            ? null
            : () => unawaited(router.push<void>(Routes.timer)),
      );
    } on ApiException catch (error) {
      showError(error.message);
    } on Exception {
      showError(null);
    }
  }
}
