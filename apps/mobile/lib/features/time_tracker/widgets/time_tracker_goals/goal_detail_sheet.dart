import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/time_tracking/goal.dart';
import 'package:mobile/features/time_tracker/utils/category_color.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

enum GoalDetailAction { edit, delete }

Future<GoalDetailAction?> showGoalDetailSheet(
  BuildContext context, {
  required TimeTrackingGoal goal,
  required String categoryName,
}) {
  return showAdaptiveSheet<GoalDetailAction>(
    context: context,
    builder: (sheetContext) => GoalDetailSheet(
      goal: goal,
      categoryName: categoryName,
    ),
  );
}

class GoalDetailSheet extends StatelessWidget {
  const GoalDetailSheet({
    required this.goal,
    required this.categoryName,
    super.key,
  });

  final TimeTrackingGoal goal;
  final String categoryName;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final categoryColor = resolveTimeTrackingCategoryColor(
      context,
      goal.category?.color,
      fallback: theme.colorScheme.primary,
    );

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.background,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.mutedForeground.withValues(
                      alpha: 0.4,
                    ),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const shad.Gap(20),
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
                      style: theme.typography.h4.copyWith(
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
              const shad.Gap(16),
              _InfoRow(
                label: l10n.timerGoalsDailyTarget,
                value: _formatMinutes(context, goal.dailyGoalMinutes),
                theme: theme,
              ),
              if (goal.weeklyGoalMinutes != null) ...[
                const shad.Gap(6),
                _InfoRow(
                  label: l10n.timerGoalsWeeklyTarget,
                  value: _formatMinutes(context, goal.weeklyGoalMinutes!),
                  theme: theme,
                ),
              ],
              const shad.Gap(24),
              Row(
                children: [
                  Expanded(
                    child: shad.OutlineButton(
                      onPressed: () =>
                          Navigator.of(context).pop(GoalDetailAction.edit),
                      child: Text(l10n.timerGoalsEdit),
                    ),
                  ),
                  const shad.Gap(10),
                  Expanded(
                    child: shad.DestructiveButton(
                      onPressed: () =>
                          Navigator.of(context).pop(GoalDetailAction.delete),
                      child: Text(l10n.timerGoalsDelete),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatMinutes(BuildContext context, int minutes) {
    final l10n = context.l10n;
    final hours = minutes ~/ 60;
    final remaining = minutes % 60;
    if (hours <= 0) return '$remaining${l10n.timerMinuteUnitShort}';
    if (remaining == 0) return '$hours${l10n.timerHourUnitShort}';
    return '$hours${l10n.timerHourUnitShort} '
        '$remaining${l10n.timerMinuteUnitShort}';
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.label,
    required this.value,
    required this.theme,
  });

  final String label;
  final String value;
  final shad.ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          label,
          style: theme.typography.textSmall.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
        const shad.Gap(8),
        Text(value, style: theme.typography.textSmall),
      ],
    );
  }
}
