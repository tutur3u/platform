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
      TimeTrackingSession? focusSession;
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
        if (paused != null) {
          await repository.stopSession(wsId, paused.id);
          try {
            focusSession = await repository.startSession(
              wsId,
              title: title,
              taskId: task.id,
            );
          } on Exception {
            // Never lose the paused work silently: put it back as it was,
            // or say plainly that it ended and offer the timer.
            final restored = await _restorePausedSession(
              repository,
              wsId,
              paused,
            );
            if (!toastContext.mounted) return;
            showAppToast(
              toastContext,
              message: switch (restored) {
                _PausedRestore.paused =>
                  l10n.taskBoardDetailFocusStartFailedRestored,
                _PausedRestore.running =>
                  l10n.taskBoardDetailFocusStartFailedRunning,
                _PausedRestore.unknown =>
                  l10n.taskBoardDetailFocusStartFailedUnknown,
                _PausedRestore.failed =>
                  l10n.taskBoardDetailFocusStartFailedPausedEnded,
              },
              variant: AppAlertVariant.destructive,
              actionLabel: l10n.taskBoardDetailOpenTimer,
              onAction: router == null
                  ? null
                  : () => unawaited(router.push<void>(Routes.timer)),
            );
            return;
          }
        } else {
          focusSession = await repository.startSession(
            wsId,
            title: title,
            taskId: task.id,
          );
        }
      } else if (current == null) {
        focusSession = await repository.startSession(
          wsId,
          title: title,
          taskId: task.id,
        );
      } else if (paused != null) {
        // Paused on this task: pick it back up.
        focusSession = await repository.resumeSession(wsId, paused.id);
      } else {
        // Already running for this task: count down on it.
        focusSession = running;
      }
      // Start focus is a device Pomodoro focus phase on that session.
      final userId = context.mounted
          ? context.read<AuthCubit?>()?.state.user?.id
          : null;
      final pomodoro = context.mounted
          ? context.read<PomodoroController?>()
          : null;
      if (focusSession != null && userId != null && pomodoro != null) {
        await pomodoro.adoptFocus(
          userId: userId,
          wsId: wsId,
          sessionId: focusSession.id,
          title: title,
          taskId: task.id,
          taskName: title,
        );
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

  /// Resumes the stopped [paused] session (the server links the new one to
  /// it) and pauses it again, retrying the pause once, so the timer looks as
  /// it did before. Reports the state the server confirms afterwards.
  Future<_PausedRestore> _restorePausedSession(
    ITimeTrackerRepository repository,
    String wsId,
    TimeTrackingSession paused,
  ) async {
    final TimeTrackingSession resumed;
    try {
      resumed = await repository.resumeSession(wsId, paused.id);
    } on Exception {
      return _PausedRestore.failed;
    }
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        await repository.pauseSession(wsId, resumed.id);
        return _PausedRestore.paused;
      } on Exception {
        // One retry, then settle what actually happened.
      }
    }
    // A pause whose response was lost may still have succeeded, so re-read
    // the server's state before reporting it.
    try {
      final pausedNow = await repository.getPausedSession(wsId);
      if (pausedNow?.id == resumed.id) return _PausedRestore.paused;
      final runningNow = await repository.getRunningSession(wsId);
      if (runningNow?.id == resumed.id) return _PausedRestore.running;
      return _PausedRestore.unknown;
    } on Exception {
      return _PausedRestore.unknown;
    }
  }
}

/// Outcome of putting a stopped paused session back.
enum _PausedRestore {
  /// Resumed and paused again: as it was.
  paused,

  /// Resumed, but the pause failed twice and the re-read shows it running.
  running,

  /// Resumed, but neither the pause nor a re-read could confirm the state.
  unknown,

  /// Not resumed: the paused session stays ended.
  failed,
}
