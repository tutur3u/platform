import 'dart:async';

import 'package:flutter/material.dart'
    hide AlertDialog, FilledButton, TextButton, TextField;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/widgets/category_sheet.dart';
import 'package:mobile/features/time_tracker/widgets/missed_entry_dialog.dart';
import 'package:mobile/features/time_tracker/widgets/running_session_info_card.dart';
import 'package:mobile/features/time_tracker/widgets/task_link_picker_sheet.dart';
import 'package:mobile/features/time_tracker/widgets/timer_advanced_section.dart';
import 'package:mobile/features/time_tracker/widgets/timer_controls.dart';
import 'package:mobile/features/time_tracker/widgets/timer_display.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TimerTab extends StatelessWidget {
  const TimerTab({this.onSeeAll, super.key});

  final VoidCallback? onSeeAll;

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
          padding: const EdgeInsets.only(bottom: 32),
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
              onResume: () => unawaited(cubit.resumeSession()),
              onAddMissedEntry: () =>
                  unawaited(_showMissedEntryDialog(context)),
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
    final shouldContinue = await _handleThresholdAndMaybeShowMissedEntry(
      context,
      cubit,
      wsId,
      userId,
    );
    if (!shouldContinue) {
      return;
    }

    try {
      await cubit.stopSession(wsId, userId);
    } on Exception catch (error) {
      if (!context.mounted) {
        return;
      }
      _showActionError(context, error);
    }
  }

  Future<void> _handlePause(
    BuildContext context,
    TimeTrackerCubit cubit,
    String wsId,
    String userId,
  ) async {
    final shouldContinue = await _handleThresholdAndMaybeShowMissedEntry(
      context,
      cubit,
      wsId,
      userId,
    );
    if (!shouldContinue) {
      return;
    }

    try {
      await cubit.pauseSession();
    } on Exception catch (error) {
      if (!context.mounted) {
        return;
      }
      _showActionError(context, error);
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
        await _hasBypassTimeTrackingRequestApprovalPermission(wsId, userId);
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
      _showMissedEntryDialog(
        context,
        hasBypassPermission: hasBypassPermission,
        initialStartTime: runningSession.startTime,
        initialEndTime: DateTime.now(),
        initialTitle: runningSession.title,
        initialDescription: runningSession.description,
        initialCategoryId: runningSession.categoryId,
        discardRunningSessionOnSave: true,
      ),
    );
    return false;
  }

  Future<bool> _hasBypassTimeTrackingRequestApprovalPermission(
    String wsId,
    String userId,
  ) async {
    if (wsId.isEmpty || userId.isEmpty) {
      return false;
    }

    try {
      final workspacePermissions = await WorkspacePermissionsRepository()
          .getPermissions(wsId: wsId, userId: userId);

      return workspacePermissions.containsPermission(
        bypassTimeTrackingRequestApprovalPermission,
      );
    } on Exception {
      return false;
    }
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

  Future<void> _showMissedEntryDialog(
    BuildContext context, {
    bool? hasBypassPermission,
    DateTime? initialStartTime,
    DateTime? initialEndTime,
    String? initialTitle,
    String? initialDescription,
    String? initialCategoryId,
    bool discardRunningSessionOnSave = false,
  }) async {
    final cubit = context.read<TimeTrackerCubit>();
    final state = cubit.state;
    final wsId =
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';
    final userId = supabase.auth.currentUser?.id ?? '';

    final canBypassApproval =
        hasBypassPermission ??
        await _hasBypassTimeTrackingRequestApprovalPermission(wsId, userId);
    if (!context.mounted) {
      return;
    }

    showAdaptiveDrawer(
      context: context,
      builder: (_) => MissedEntryDialog(
        categories: cubit.state.categories,
        canBypassRequestApproval: canBypassApproval,
        thresholdDays: state.thresholdDays,
        initialStartTime: initialStartTime,
        initialEndTime: initialEndTime,
        initialTitle: initialTitle,
        initialDescription: initialDescription,
        initialCategoryId: initialCategoryId,
        onSave:
            ({
              required title,
              required startTime,
              required endTime,
              required shouldSubmitAsRequest,
              required imageLocalPaths,
              categoryId,
              description,
            }) async {
              if (shouldSubmitAsRequest) {
                await cubit.createMissedEntryAsRequest(
                  wsId,
                  userId,
                  title: title,
                  categoryId: categoryId,
                  startTime: startTime,
                  endTime: endTime,
                  description: description,
                  imageLocalPaths: imageLocalPaths,
                  throwOnError: true,
                );

                if (discardRunningSessionOnSave) {
                  await cubit.discardRunningSession(
                    wsId,
                    userId,
                    throwOnError: true,
                  );
                }

                return;
              }

              await cubit.createMissedEntry(
                wsId,
                userId,
                title: title,
                categoryId: categoryId,
                startTime: startTime,
                endTime: endTime,
                description: description,
                throwOnError: true,
              );
            },
      ),
    );
  }
}

enum _ExceededSessionAction { discard, submitRequest }
