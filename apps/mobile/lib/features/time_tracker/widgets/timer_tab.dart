import 'dart:async';

import 'package:flutter/material.dart'
    hide AlertDialog, FilledButton, TextButton, TextField;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/utils/missed_entry_flow.dart';
import 'package:mobile/features/time_tracker/widgets/category_sheet.dart';
import 'package:mobile/features/time_tracker/widgets/running_session_info_card.dart';
import 'package:mobile/features/time_tracker/widgets/task_link_picker_sheet.dart';
import 'package:mobile/features/time_tracker/widgets/timer_advanced_section.dart';
import 'package:mobile/features/time_tracker/widgets/timer_controls.dart';
import 'package:mobile/features/time_tracker/widgets/timer_display.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TimerTab extends StatefulWidget {
  const TimerTab({super.key});

  @override
  State<TimerTab> createState() => _TimerTabState();
}

class _TimerTabState extends State<TimerTab> {
  _TimerControlAction? _pendingAction;

  bool get _isActionInProgress => _pendingAction != null;

  bool _isActionLoading(_TimerControlAction action) => _pendingAction == action;

  void _setPendingAction(_TimerControlAction? action) {
    if (!mounted) {
      return;
    }
    setState(() {
      _pendingAction = action;
    });
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<TimeTrackerCubit, TimeTrackerState>(
      builder: (context, state) {
        final l10n = context.l10n;
        final cubit = context.read<TimeTrackerCubit>();

        final wsId =
            context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';
        final userId = supabase.auth.currentUser?.id ?? '';

        return ListView(
          padding: const EdgeInsets.only(bottom: 96),
          children: [
            const shad.Gap(32),
            // Timer display
            Center(
              child: TimerDisplay(
                elapsed: state.elapsed,
                isRunning: state.isRunning,
                isPaused: state.isPaused,
                pomodoroPhase: state.pomodoroPhase,
              ),
            ),
            const shad.Gap(24),
            // Timer controls
            TimerControls(
              isRunning: state.isRunning,
              isPaused: state.isPaused,
              onStart: () => unawaited(cubit.startSession(wsId)),
              onStop: () =>
                  unawaited(_handleStop(context, cubit, wsId, userId)),
              onPause: () =>
                  unawaited(_handlePause(context, cubit, wsId, userId)),
              onResume: () => unawaited(_handleResume(context, cubit)),
              areActionButtonsDisabled: _isActionInProgress,
              isPauseLoading: _isActionLoading(_TimerControlAction.pause),
              isStopLoading: _isActionLoading(_TimerControlAction.stop),
              isResumeLoading: _isActionLoading(_TimerControlAction.resume),
            ),
            const shad.Gap(24),
            // Running session info card (read-only summary while running/paused)
            if (state.isRunning || state.isPaused) ...[
              RunningSessionInfoCard(
                title: state.runningSession?.title,
                description: state.runningSession?.description,
                categoryName: state.runningSession?.categoryName,
                categoryColor: state.runningSession?.categoryColor,
                taskName: state.runningSessionTaskName,
                taskTicketLabel: state.runningSessionTaskTicketLabel,
              ),
              const shad.Gap(8),
            ],
            // Session title input
            if (!state.isRunning && !state.isPaused)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: shad.FormField(
                  key: const shad.FormKey<String>(#sessionTitle),
                  label: Text(l10n.timerSessionTitle),
                  child: shad.TextField(
                    onChanged: cubit.setTitle,
                  ),
                ),
              ),
            // Advanced section (category, description, task link)
            if (!state.isRunning && !state.isPaused) ...[
              const shad.Gap(16),
              TimerAdvancedSection(
                categories: state.categories,
                selectedCategoryId: state.selectedCategoryId,
                onOpenCategoryPicker: () => showCategorySheet(
                  context: context,
                  categories: state.categories,
                  selectedCategoryId: state.selectedCategoryId,
                  onSelected: cubit.selectCategory,
                  onCreateCategory:
                      ({
                        required name,
                        color,
                        description,
                      }) => cubit.createCategory(
                        wsId,
                        name,
                        color: color,
                        description: description,
                        throwOnError: true,
                      ),
                ),
                initialDescription: state.sessionDescription,
                initialTaskId: state.sessionTaskId,
                initialTaskName: state.sessionTaskName,
                initialTaskTicketLabel: state.sessionTaskTicketLabel,
                onDescriptionChanged: cubit.setDescription,
                onClearTask: () => cubit.setTaskOption(null),
                onOpenTaskPicker: () {
                  if (wsId.isEmpty) {
                    return;
                  }
                  unawaited(
                    showTaskLinkPickerSheet(
                      context: context,
                      taskRepository: TaskRepository(),
                      wsId: wsId,
                      selectedTaskId: state.sessionTaskId,
                      onSelected: cubit.setTaskOption,
                    ),
                  );
                },
              ),
            ],
          ],
        );
      },
    );
  }

  Future<void> _handleStop(
    BuildContext context,
    TimeTrackerCubit cubit,
    String wsId,
    String userId,
  ) async {
    if (_isActionInProgress) {
      return;
    }

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    _setPendingAction(_TimerControlAction.stop);

    try {
      final shouldContinue = await _handleThresholdAndMaybeShowMissedEntry(
        context,
        cubit,
        wsId,
        userId,
      );
      if (!shouldContinue) {
        return;
      }

      await cubit.stopSession(wsId, userId, throwOnError: true);
      if (!toastContext.mounted) {
        return;
      }
      shad.showToast(
        context: toastContext,
        builder: (ctx, overlay) =>
            shad.Alert(content: Text(ctx.l10n.timerSessionStopSuccess)),
      );
    } on Exception catch (error) {
      if (!toastContext.mounted) {
        return;
      }
      _showActionError(toastContext, error);
    } finally {
      _setPendingAction(null);
    }
  }

  Future<void> _handlePause(
    BuildContext context,
    TimeTrackerCubit cubit,
    String wsId,
    String userId,
  ) async {
    if (_isActionInProgress) {
      return;
    }

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    _setPendingAction(_TimerControlAction.pause);

    try {
      final shouldContinue = await _handleThresholdAndMaybeShowMissedEntry(
        context,
        cubit,
        wsId,
        userId,
      );
      if (!shouldContinue) {
        return;
      }

      await cubit.pauseSession();
      if (!toastContext.mounted) {
        return;
      }
      shad.showToast(
        context: toastContext,
        builder: (ctx, overlay) =>
            shad.Alert(content: Text(ctx.l10n.timerSessionPauseSuccess)),
      );
    } on Exception catch (error) {
      if (!toastContext.mounted) {
        return;
      }
      _showActionError(toastContext, error);
    } finally {
      _setPendingAction(null);
    }
  }

  Future<void> _handleResume(
    BuildContext context,
    TimeTrackerCubit cubit,
  ) async {
    if (_isActionInProgress) {
      return;
    }

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    _setPendingAction(_TimerControlAction.resume);

    try {
      await cubit.resumeSession(throwOnError: true);
      if (!toastContext.mounted) {
        return;
      }
      shad.showToast(
        context: toastContext,
        builder: (ctx, overlay) =>
            shad.Alert(content: Text(ctx.l10n.timerSessionResumeSuccess)),
      );
    } on Exception catch (error) {
      if (!toastContext.mounted) {
        return;
      }
      _showActionError(toastContext, error);
    } finally {
      _setPendingAction(null);
    }
  }

  Future<bool> _handleThresholdAndMaybeShowMissedEntry(
    BuildContext context,
    TimeTrackerCubit cubit,
    String wsId,
    String userId,
  ) async {
    final runningSession = cubit.state.runningSession;
    if (runningSession == null ||
        !cubit.sessionExceedsThreshold(runningSession)) {
      return true;
    }

    final hasBypassPermission =
        await hasBypassTimeTrackingRequestApprovalPermission(
          wsId: wsId,
          userId: userId,
        );
    if (hasBypassPermission) {
      return true;
    }
    if (!context.mounted) {
      return false;
    }

    final action = await _showExceededSessionActionDialog(context);
    if (action == null) {
      return false;
    }
    if (!context.mounted) {
      return false;
    }

    if (action == _ExceededSessionAction.discard) {
      try {
        await cubit.discardRunningSession(wsId, userId, throwOnError: true);
      } on Exception catch (error) {
        if (!context.mounted) {
          return false;
        }
        _showActionError(context, error);
      }
      return false;
    }

    unawaited(
      showMissedEntryDialogFlow(
        context,
        wsId: wsId,
        userId: userId,
        categories: cubit.state.categories,
        thresholdDays: cubit.state.thresholdDays,
        onCreateMissedEntry:
            ({
              required title,
              required startTime,
              required endTime,
              categoryId,
              description,
            }) => cubit.createMissedEntry(
              wsId,
              userId,
              title: title,
              categoryId: categoryId,
              startTime: startTime,
              endTime: endTime,
              description: description,
              throwOnError: true,
            ),
        onCreateMissedEntryAsRequest:
            ({
              required title,
              required startTime,
              required endTime,
              required imageLocalPaths,
              categoryId,
              description,
            }) => cubit.createMissedEntryAsRequest(
              wsId,
              userId,
              title: title,
              categoryId: categoryId,
              startTime: startTime,
              endTime: endTime,
              description: description,
              imageLocalPaths: imageLocalPaths,
              throwOnError: true,
            ),
        onAfterSave: () => cubit.discardRunningSession(
          wsId,
          userId,
          throwOnError: true,
        ),
        hasBypassPermission: hasBypassPermission,
        initialStartTime: runningSession.startTime,
        initialEndTime: DateTime.now(),
        initialTitle: runningSession.title,
        initialDescription: runningSession.description,
        initialCategoryId: runningSession.categoryId,
      ),
    );
    return false;
  }

  void _showActionError(BuildContext context, Object error) {
    shad.showToast(
      context: context,
      builder: (context, overlay) => shad.Alert.destructive(
        title: Text(context.l10n.commonSomethingWentWrong),
        content: Text(error.toString()),
      ),
    );
  }

  Future<_ExceededSessionAction?> _showExceededSessionActionDialog(
    BuildContext context,
  ) {
    final l10n = context.l10n;
    return showDialog<_ExceededSessionAction>(
      context: context,
      builder: (dialogCtx) => Center(
        child: SizedBox(
          width: MediaQuery.of(context).size.width * 0.85,
          child: shad.AlertDialog(
            barrierColor: Colors.transparent,
            title: Text(l10n.timerSessionExceeded),
            content: Text(l10n.timerSessionExceededDescription),
            actions: [
              shad.OutlineButton(
                onPressed: () => Navigator.of(dialogCtx).pop(),
                child: Text(context.l10n.commonCancel),
              ),
              shad.DestructiveButton(
                onPressed: () => Navigator.of(dialogCtx).pop(
                  _ExceededSessionAction.discard,
                ),
                child: Text(l10n.timerDiscardSession),
              ),
              shad.PrimaryButton(
                onPressed: () => Navigator.of(dialogCtx).pop(
                  _ExceededSessionAction.submitRequest,
                ),
                child: Text(l10n.timerSubmitAsRequest),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

enum _ExceededSessionAction { discard, submitRequest }

enum _TimerControlAction { pause, stop, resume }
