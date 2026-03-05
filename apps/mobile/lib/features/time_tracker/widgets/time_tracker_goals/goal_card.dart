import 'package:flutter/material.dart';
import 'package:mobile/data/models/time_tracking/goal.dart';
import 'package:mobile/features/time_tracker/utils/category_color.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class GoalCard extends StatelessWidget {
  const GoalCard({
    required this.goal,
    required this.todaySeconds,
    required this.weekSeconds,
    required this.onTap,
    super.key,
  });

  final TimeTrackingGoal goal;
  final int todaySeconds;
  final int weekSeconds;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final categoryName = goal.category?.name ?? l10n.timerGoalsGeneral;
    final categoryColor = resolveTimeTrackingCategoryColor(
      context,
      goal.category?.color,
      fallback: theme.colorScheme.primary,
    );
    final dailyProgress = _calculateProgress(
      todaySeconds,
      goal.dailyGoalMinutes,
    );
    final weeklyGoal = goal.weeklyGoalMinutes;
    final weeklyProgress = weeklyGoal == null
        ? null
        : _calculateProgress(weekSeconds, weeklyGoal);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Ink(
          decoration: BoxDecoration(
            color: theme.colorScheme.background,
            border: Border.all(color: theme.colorScheme.border),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: categoryColor,
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    const shad.Gap(8),
                    Expanded(
                      child: Text(
                        categoryName,
                        style: theme.typography.small.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: goal.isActive
                            ? theme.colorScheme.primary.withValues(alpha: 0.12)
                            : theme.colorScheme.muted,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        goal.isActive
                            ? l10n.timerGoalsActive
                            : l10n.timerGoalsInactive,
                        style: theme.typography.textSmall,
                      ),
                    ),
                  ],
                ),
                const shad.Gap(8),
                _GoalProgressRow(
                  title: l10n.timerGoalsDailyProgress,
                  progressPercent: dailyProgress,
                  progressLabel:
                      '${_formatSeconds(todaySeconds)} / ${_formatMinutes(goal.dailyGoalMinutes)}',
                ),
                if (weeklyProgress != null) ...[
                  const shad.Gap(8),
                  _GoalProgressRow(
                    title: l10n.timerGoalsWeeklyProgress,
                    progressPercent: weeklyProgress,
                    progressLabel:
                        '${_formatSeconds(weekSeconds)} / ${_formatMinutes(weeklyGoal!)}',
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  double _calculateProgress(int seconds, int targetMinutes) {
    if (targetMinutes <= 0) {
      return 0;
    }
    return ((seconds / (targetMinutes * 60)) * 100).clamp(0, 100);
  }

  String _formatMinutes(int minutes) {
    final hours = minutes ~/ 60;
    final remainingMinutes = minutes % 60;
    if (hours <= 0) {
      return '${remainingMinutes}m';
    }
    return '${hours}h ${remainingMinutes}m';
  }

  String _formatSeconds(int totalSeconds) {
    final hours = totalSeconds ~/ 3600;
    final minutes = (totalSeconds % 3600) ~/ 60;
    if (hours <= 0) {
      return '${minutes}m';
    }
    return '${hours}h ${minutes}m';
  }
}

class _GoalProgressRow extends StatelessWidget {
  const _GoalProgressRow({
    required this.title,
    required this.progressPercent,
    required this.progressLabel,
  });

  final String title;
  final double progressPercent;
  final String progressLabel;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: Text(title, style: theme.typography.textSmall)),
            Text('${progressPercent.round()}%'),
          ],
        ),
        const shad.Gap(6),
        shad.LinearProgressIndicator(
          value: (progressPercent / 100).clamp(0, 1),
        ),
        const shad.Gap(4),
        Text(
          progressLabel,
          style: theme.typography.textSmall.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
      ],
    );
  }
}
