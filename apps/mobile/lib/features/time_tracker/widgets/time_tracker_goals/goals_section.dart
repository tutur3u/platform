import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/time_tracking/goal.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/widgets/time_tracker_goals/goal_card.dart';
import 'package:mobile/features/time_tracker/widgets/time_tracker_goals/goal_detail_sheet.dart';
import 'package:mobile/features/time_tracker/widgets/time_tracker_goals/goal_form_sheet.dart';
import 'package:mobile/features/time_tracker/widgets/time_tracker_goals/goals_empty_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TimeTrackerGoalsSection extends StatefulWidget {
  const TimeTrackerGoalsSection({required this.wsId, super.key});

  final String wsId;

  @override
  State<TimeTrackerGoalsSection> createState() =>
      _TimeTrackerGoalsSectionState();
}

class _TimeTrackerGoalsSectionState extends State<TimeTrackerGoalsSection> {
  bool _isSubmitting = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return BlocBuilder<TimeTrackerCubit, TimeTrackerState>(
      builder: (context, state) {
        final goals = state.goals;
        final activeGoals = goals.where((goal) => goal.isActive).toList();
        final shouldShowLoading = state.isGoalsLoading && !state.hasLoadedGoals;

        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: shad.Card(
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              l10n.timerGoalsTitle,
                              style: theme.typography.p.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              l10n.timerGoalsSubtitle,
                              style: theme.typography.textSmall.copyWith(
                                color: theme.colorScheme.mutedForeground,
                              ),
                            ),
                          ],
                        ),
                      ),
                      shad.OutlineButton(
                        onPressed: _isSubmitting
                            ? null
                            : () => _openCreateGoalSheet(state),
                        child: Text(l10n.timerGoalsAdd),
                      ),
                    ],
                  ),
                  const shad.Gap(12),
                  if (shouldShowLoading)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 24),
                      child: Center(child: shad.CircularProgressIndicator()),
                    )
                  else if (goals.isEmpty)
                    GoalsEmptyState(
                      onCreatePressed: _isSubmitting
                          ? null
                          : () => _openCreateGoalSheet(state),
                    )
                  else
                    ...goals.map(
                      (goal) {
                        final progressSeconds = _resolveGoalProgressSeconds(
                          state,
                          goal,
                        );

                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: GoalCard(
                            goal: goal,
                            categoryTodaySeconds: progressSeconds.$1,
                            categoryWeekSeconds: progressSeconds.$2,
                            onTap: _isSubmitting
                                ? null
                                : () => _openGoalDetailSheet(state, goal),
                          ),
                        );
                      },
                    ),
                  if (activeGoals.isNotEmpty && goals.length > 1)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        l10n.timerGoalsActiveCount(activeGoals.length),
                        style: theme.typography.textSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _openGoalDetailSheet(
    TimeTrackerState state,
    TimeTrackingGoal goal,
  ) async {
    final rootContext = context;
    final l10n = rootContext.l10n;
    final categoryName = goal.category?.name ?? l10n.timerGoalsGeneral;
    final action = await showGoalDetailSheet(
      rootContext,
      goal: goal,
      categoryName: categoryName,
    );
    if (action == null || !rootContext.mounted) return;
    if (action == GoalDetailAction.edit) {
      await _openEditGoalSheet(state, goal);
    } else if (action == GoalDetailAction.delete) {
      await _confirmDeleteGoal(goal);
    }
  }

  Future<void> _confirmDeleteGoal(TimeTrackingGoal goal) async {
    final rootContext = context;
    final l10n = rootContext.l10n;
    final cubit = rootContext.read<TimeTrackerCubit>();
    final toastContext = Navigator.of(rootContext, rootNavigator: true).context;
    final shouldDelete = await showDialog<bool>(
      context: rootContext,
      builder: (dialogContext) => shad.AlertDialog(
        title: Text(l10n.timerGoalsDeleteTitle),
        content: Text(l10n.timerGoalsDeleteDescription),
        actions: [
          shad.OutlineButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(l10n.commonCancel),
          ),
          shad.DestructiveButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(l10n.timerGoalsDelete),
          ),
        ],
      ),
    );

    if (shouldDelete != true || !rootContext.mounted) {
      return;
    }

    await _runGoalAction(
      action: () => cubit.deleteGoal(widget.wsId, goal.id, throwOnError: true),
      toastContext: toastContext,
      successMessage: rootContext.l10n.timerGoalsDeleteSuccess,
    );
  }

  Future<void> _openCreateGoalSheet(TimeTrackerState state) async {
    final rootContext = context;
    final cubit = rootContext.read<TimeTrackerCubit>();
    final l10n = rootContext.l10n;
    final toastContext = Navigator.of(rootContext, rootNavigator: true).context;
    final result = await showGoalFormSheet(
      rootContext,
      categories: state.categories,
      title: l10n.timerGoalsCreateTitle,
      saveLabel: l10n.timerGoalsCreate,
    );
    if (result == null || !rootContext.mounted) {
      return;
    }

    await _runGoalAction(
      action: () => cubit.createGoal(
        widget.wsId,
        dailyGoalMinutes: result.dailyGoalMinutes,
        categoryId: result.categoryId,
        weeklyGoalMinutes: result.weeklyGoalMinutes,
        isActive: result.isActive,
        throwOnError: true,
      ),
      toastContext: toastContext,
      successMessage: l10n.timerGoalsCreateSuccess,
    );
  }

  Future<void> _openEditGoalSheet(
    TimeTrackerState state,
    TimeTrackingGoal goal,
  ) async {
    final rootContext = context;
    final cubit = rootContext.read<TimeTrackerCubit>();
    final l10n = rootContext.l10n;
    final toastContext = Navigator.of(rootContext, rootNavigator: true).context;
    final result = await showGoalFormSheet(
      rootContext,
      categories: state.categories,
      title: l10n.timerGoalsEditTitle,
      saveLabel: l10n.timerGoalsSave,
      initialGoal: goal,
    );
    if (result == null || !rootContext.mounted) {
      return;
    }

    await _runGoalAction(
      action: () => cubit.updateGoal(
        widget.wsId,
        goal.id,
        categoryId: result.categoryId,
        dailyGoalMinutes: result.dailyGoalMinutes,
        weeklyGoalMinutes: result.weeklyGoalMinutes,
        isActive: result.isActive,
        throwOnError: true,
      ),
      toastContext: toastContext,
      successMessage: l10n.timerGoalsUpdateSuccess,
    );
  }

  Future<void> _runGoalAction({
    required Future<void> Function() action,
    required BuildContext toastContext,
    String? successMessage,
  }) async {
    final l10n = context.l10n;
    setState(() => _isSubmitting = true);
    try {
      await action();
      if (successMessage != null && toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (context, overlay) => shad.Alert(
            content: Text(successMessage),
          ),
        );
      }
    } on ApiException catch (error) {
      if (toastContext.mounted) {
        final trimmedMessage = error.message.trim();
        final displayMessage = trimmedMessage.isNotEmpty
            ? trimmedMessage
            : l10n.commonSomethingWentWrong;

        shad.showToast(
          context: toastContext,
          builder: (context, overlay) => shad.Alert.destructive(
            title: Text(context.l10n.commonSomethingWentWrong),
            content: Text(displayMessage),
          ),
        );
      }
    } on Exception {
      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (context, overlay) => shad.Alert.destructive(
            title: Text(context.l10n.commonSomethingWentWrong),
            content: Text(l10n.timerGoalsOperationFailed),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  (int, int) _resolveGoalProgressSeconds(
    TimeTrackerState state,
    TimeTrackingGoal goal,
  ) {
    final sessions = state.historySessions;
    if (sessions.isEmpty) {
      return (0, 0);
    }

    final now = DateTime.now();
    final startOfWeek = DateTime(
      now.year,
      now.month,
      now.day,
    ).subtract(Duration(days: now.weekday - 1));
    final endOfWeek = startOfWeek.add(const Duration(days: 7));

    var todaySeconds = 0;
    var weekSeconds = 0;

    for (final session in sessions) {
      if (!_matchesGoalCategory(goal, session)) {
        continue;
      }

      final sessionDate = session.startTime ?? session.createdAt;
      if (sessionDate == null) {
        continue;
      }

      final seconds = session.duration.inSeconds;
      if (seconds <= 0) {
        continue;
      }

      if (DateUtils.isSameDay(sessionDate, now)) {
        todaySeconds += seconds;
      }

      if (!sessionDate.isBefore(startOfWeek) &&
          sessionDate.isBefore(endOfWeek)) {
        weekSeconds += seconds;
      }
    }

    return (todaySeconds, weekSeconds);
  }

  bool _matchesGoalCategory(
    TimeTrackingGoal goal,
    TimeTrackingSession session,
  ) {
    final goalCategoryId = goal.categoryId;
    if (goalCategoryId == null) {
      return session.categoryId == null;
    }

    return session.categoryId == goalCategoryId;
  }
}
