part of 'task_board_detail_page.dart';

/// "Start focus" from a task row.
///
/// There is no Pomodoro entry point for a task yet (planned for phase 6), so
/// this starts an ordinary time-tracking session linked to the task through
/// the existing tracker API. A running or paused timer for another task is
/// only replaced after confirmation; one for this task is kept or resumed.
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
      // A paused session (stopped, with its break still open) is replaced
      // with the same care as a running one.
      final running = await repository.getRunningSession(wsId);
      final paused = running == null
          ? await repository.getPausedSession(wsId)
          : null;
      final current = running ?? paused;
      if (!context.mounted) return;
      if (current != null && current.taskId != task.id) {
        final confirmed = await showAppConfirmDialog(
          context: context,
          title: paused != null
              ? l10n.taskBoardDetailFocusReplacePausedTitle
              : l10n.taskBoardDetailFocusReplaceTitle,
          message: paused != null
              ? l10n.taskBoardDetailFocusReplacePausedMessage
              : l10n.taskBoardDetailFocusReplaceMessage,
          confirmLabel: l10n.taskBoardDetailFocusReplaceConfirm,
          cancelLabel: l10n.commonCancel,
        );
        if (!confirmed || !context.mounted) return;
        // Starting only closes running sessions; stopping a paused one also
        // closes its open break.
        if (paused != null) await repository.stopSession(wsId, paused.id);
        await repository.startSession(wsId, title: title, taskId: task.id);
      } else if (current == null) {
        await repository.startSession(wsId, title: title, taskId: task.id);
      } else if (paused != null) {
        // Paused on this task: pick it back up.
        await repository.resumeSession(wsId, paused.id);
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
