import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/time_tracking/goal.dart';
import 'package:mobile/features/time_tracker/utils/category_color.dart';
import 'package:mobile/l10n/l10n.dart';

class GoalCard extends StatelessWidget {
  const GoalCard({
    required this.goal,
    required this.categoryTodaySeconds,
    required this.categoryWeekSeconds,
    required this.onTap,
    super.key,
  });

  final TimeTrackingGoal goal;
  final int categoryTodaySeconds;
  final int categoryWeekSeconds;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = AppTokens.of(context);
    final categoryName = goal.category?.name ?? l10n.timerGoalsGeneral;
    final categoryColor = resolveTimeTrackingCategoryColor(
      context,
      goal.category?.color,
      fallback: theme.colorScheme.primary,
    );
    final dailyProgress = _calculateProgress(
      categoryTodaySeconds,
      goal.dailyGoalMinutes,
    );
    final weeklyGoal = goal.weeklyGoalMinutes;
    final weeklyProgress = weeklyGoal == null
        ? null
        : _calculateProgress(categoryWeekSeconds, weeklyGoal);

    return AppCard(
      onTap: onTap,
      borderColor: theme.colorScheme.border,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(LucideIcons.target, color: categoryColor, size: 18),
              const AppGap(AppSpacing.sm),
              Expanded(
                child: Text(
                  categoryName,
                  style: theme.typography.base.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (!goal.isActive)
                AppBadge.outline(child: Text(l10n.timerGoalsInactive)),
            ],
          ),
          const AppGap(AppSpacing.md),
          _GoalProgressRow(
            title: l10n.timerGoalsDailyProgress,
            progressPercent: dailyProgress,
            progressLabel:
                '${_formatSeconds(context, categoryTodaySeconds)} / ${_formatMinutes(context, goal.dailyGoalMinutes)}',
          ),
          if (weeklyProgress != null) ...[
            const AppGap(AppSpacing.md),
            _GoalProgressRow(
              title: l10n.timerGoalsWeeklyProgress,
              progressPercent: weeklyProgress,
              progressLabel:
                  '${_formatSeconds(context, categoryWeekSeconds)} / ${_formatMinutes(context, weeklyGoal!)}',
            ),
          ],
        ],
      ),
    );
  }

  double _calculateProgress(int seconds, int targetMinutes) {
    if (targetMinutes <= 0) {
      return 0;
    }
    return ((seconds / (targetMinutes * 60)) * 100).clamp(0, 100);
  }

  String _formatMinutes(BuildContext context, int minutes) {
    final l10n = context.l10n;
    final hours = minutes ~/ 60;
    final remainingMinutes = minutes % 60;
    if (hours <= 0) {
      return '$remainingMinutes${l10n.timerMinuteUnitShort}';
    }
    return '$hours${l10n.timerHourUnitShort} '
        '$remainingMinutes${l10n.timerMinuteUnitShort}';
  }

  String _formatSeconds(BuildContext context, int totalSeconds) {
    final l10n = context.l10n;
    final hours = totalSeconds ~/ 3600;
    final minutes = (totalSeconds % 3600) ~/ 60;
    if (hours <= 0) {
      return '$minutes${l10n.timerMinuteUnitShort}';
    }
    return '$hours${l10n.timerHourUnitShort} '
        '$minutes${l10n.timerMinuteUnitShort}';
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
    final theme = AppTokens.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: Text(title, style: theme.typography.small)),
            Text('${progressPercent.round()}%'),
          ],
        ),
        const AppGap(AppSpacing.xs),
        AppMeter(value: (progressPercent / 100).clamp(0, 1)),
        const AppGap(AppSpacing.xs),
        Text(
          progressLabel,
          style: theme.typography.small.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
      ],
    );
  }
}
