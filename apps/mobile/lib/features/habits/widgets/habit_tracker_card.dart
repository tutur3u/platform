import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/features/habits/habit_tracker_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

class HabitTrackerCard extends StatelessWidget {
  const HabitTrackerCard({
    required this.summary,
    required this.scope,
    required this.onQuickLog,
    required this.onSelect,
    required this.onEdit,
    this.selected = false,
    super.key,
  });

  final HabitTrackerCardSummary summary;
  final HabitTrackerScope scope;
  final VoidCallback? onQuickLog;
  final VoidCallback onSelect;
  final VoidCallback onEdit;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final tracker = summary.tracker;
    final l10n = context.l10n;
    final member = summary.currentMember;
    final value = scope == HabitTrackerScope.team
        ? summary.team?.totalValue ?? 0.0
        : member?.currentPeriodTotal ?? 0.0;
    final streak = scope == HabitTrackerScope.team
        ? summary.team?.topStreak ?? 0
        : member?.streak.currentStreak ?? 0;
    final target = tracker.targetValue;
    final progress = target > 0 ? (value / target).clamp(0.0, 1.0) : 0.0;
    final unit = primaryFieldForTracker(tracker)?.unit?.trim();
    final period = tracker.targetPeriod == HabitTrackerTargetPeriod.daily
        ? l10n.habitsPeriodDaily
        : l10n.habitsPeriodWeekly;
    final total =
        '${formatCompactNumber(value)} / ${formatCompactNumber(target)}'
        '${unit?.isNotEmpty == true ? ' $unit' : ''}';
    final tokens = AppTokens.of(context);
    final color = tokens.colorScheme;
    final (actionLabel, actionIcon) = switch (tracker.composerMode) {
      HabitTrackerComposerMode.quickCheck => (
        l10n.habitsCompleteNow,
        LucideIcons.check,
      ),
      HabitTrackerComposerMode.workoutSession => (
        l10n.habitsLogSessionAction,
        LucideIcons.plus,
      ),
      HabitTrackerComposerMode.measurement => (
        l10n.habitsLogMeasurementAction,
        LucideIcons.plus,
      ),
      _ => (l10n.habitsLogEntryAction, LucideIcons.plus),
    };
    return Semantics(
      selected: selected,
      child: AppGroupedRow(
        onTap: onSelect,
        leading: SizedBox.square(
          dimension: 40,
          child: Stack(
            fit: StackFit.expand,
            children: [
              CircularProgressIndicator(
                value: progress,
                strokeWidth: 3,
                color: color.primary,
                backgroundColor: color.muted,
                semanticsValue: NumberFormat.percentPattern(
                  l10n.localeName,
                ).format(progress),
              ),
              Icon(
                habitTrackerIcon(tracker.icon),
                color: color.primary,
                size: 18,
              ),
            ],
          ),
        ),
        title: Text(tracker.name),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('$total · $period'),
            if (streak > 0) Text(l10n.habitsStreakChip(streak)),
          ],
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppIconButton(
              tooltip: actionLabel,
              icon: Icon(actionIcon),
              onPressed: onQuickLog,
            ),
            AppIconButton(
              tooltip: l10n.commonEdit,
              icon: const Icon(LucideIcons.ellipsis),
              onPressed: onEdit,
            ),
          ],
        ),
      ),
    );
  }
}
