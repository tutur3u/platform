import 'package:flutter/material.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/habits/habit_tracker_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
  final VoidCallback onQuickLog;
  final VoidCallback onSelect;
  final VoidCallback onEdit;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final tracker = summary.tracker;
    final primaryField = primaryFieldForTracker(tracker);
    final latestValue = summary.currentMember?.latestValue;
    final latestOccurredAt = summary.currentMember?.latestOccurredAt;
    final currentPeriodValue = scope == HabitTrackerScope.team
        ? (summary.team?.totalValue ?? 0)
        : (summary.currentMember?.currentPeriodTotal ?? 0);
    final streak = scope == HabitTrackerScope.team
        ? (summary.team?.topStreak ?? 0)
        : (summary.currentMember?.streak.currentStreak ?? 0);
    final progress = tracker.targetValue <= 0
        ? 0.0
        : (currentPeriodValue / tracker.targetValue).clamp(0, 1).toDouble();
    final accent = habitTrackerColor(context, tracker.color);

    return FinancePanel(
      padding: const EdgeInsets.all(16),
      radius: 22,
      borderColor: selected ? accent.withValues(alpha: 0.34) : null,
      backgroundColor: selected
          ? accent.withValues(alpha: 0.07)
          : FinancePalette.of(context).panel,
      onTap: onSelect,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  color: accent.withValues(alpha: 0.14),
                ),
                child: Icon(habitTrackerIcon(tracker.icon), color: accent),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tracker.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: shad.Theme.of(
                        context,
                      ).typography.large.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      _summaryLine(
                        context,
                        tracker,
                        primaryField,
                        currentPeriodValue,
                        latestValue,
                        latestOccurredAt,
                        streak,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: shad.Theme.of(context).typography.textSmall
                          .copyWith(
                            color: shad.Theme.of(
                              context,
                            ).colorScheme.mutedForeground,
                          ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              _ProgressRing(progress: progress, accent: accent),
              const SizedBox(width: 2),
              shad.IconButton.ghost(
                icon: const Icon(Icons.settings_outlined),
                onPressed: onEdit,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _MetaPill(
                label: _valueLine(
                  context,
                  tracker,
                  primaryField,
                  currentPeriodValue,
                  latestValue,
                ),
              ),
              _MetaPill(label: _periodLabel(context, tracker)),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: shad.PrimaryButton(
              onPressed: onQuickLog,
              child: Text(_primaryActionLabel(context, tracker)),
            ),
          ),
        ],
      ),
    );
  }

  String _summaryLine(
    BuildContext context,
    HabitTracker tracker,
    HabitTrackerFieldSchema? primaryField,
    double currentPeriodValue,
    double? latestValue,
    DateTime? latestOccurredAt,
    int streak,
  ) {
    final unit = primaryField?.unit?.trim();
    final prefix =
        tracker.composerMode == HabitTrackerComposerMode.measurement &&
            latestValue != null
        ? context.l10n.habitsLatestValueLabel(
            '${formatCompactNumber(latestValue)}${unit?.isNotEmpty == true ? ' $unit' : ''}',
          )
        : currentPeriodValue > 0
        ? '${formatCompactNumber(currentPeriodValue)}${unit?.isNotEmpty == true ? ' $unit' : ''}'
        : context.l10n.habitsLogEntryAction;
    if (latestOccurredAt != null) {
      final timeLabel = MaterialLocalizations.of(context).formatTimeOfDay(
        TimeOfDay.fromDateTime(latestOccurredAt.toLocal()),
      );
      return '$prefix • $timeLabel';
    }
    return '$prefix • ${context.l10n.habitsCurrentStreak} $streak';
  }

  String _valueLine(
    BuildContext context,
    HabitTracker tracker,
    HabitTrackerFieldSchema? primaryField,
    double currentPeriodValue,
    double? latestValue,
  ) {
    final currentLabel = formatCompactNumber(currentPeriodValue);
    final targetLabel = formatCompactNumber(tracker.targetValue);
    final unit = primaryField?.unit?.trim();
    final suffix = unit?.isNotEmpty == true ? ' $unit' : '';

    if (tracker.composerMode == HabitTrackerComposerMode.measurement) {
      final valueLabel = formatCompactNumber(latestValue ?? 0);
      final latestLabel = context.l10n.habitsLatestValueLabel(
        '$valueLabel$suffix',
      );
      return '$latestLabel · $targetLabel$suffix';
    }

    return '$currentLabel$suffix / $targetLabel$suffix';
  }

  String _periodLabel(BuildContext context, HabitTracker tracker) {
    return tracker.targetPeriod == HabitTrackerTargetPeriod.daily
        ? context.l10n.habitsPeriodDaily
        : context.l10n.habitsPeriodWeekly;
  }

  String _primaryActionLabel(BuildContext context, HabitTracker tracker) {
    final l10n = context.l10n;
    return switch (tracker.composerMode) {
      HabitTrackerComposerMode.quickCheck => l10n.habitsCompleteNow,
      HabitTrackerComposerMode.quickIncrement => l10n.habitsLogEntryAction,
      HabitTrackerComposerMode.measurement => l10n.habitsLogMeasurementAction,
      HabitTrackerComposerMode.workoutSession => l10n.habitsLogSessionAction,
      HabitTrackerComposerMode.advancedCustom => l10n.habitsLogEntryAction,
    };
  }
}

class _MetaPill extends StatelessWidget {
  const _MetaPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: Theme.of(
          context,
        ).colorScheme.surfaceContainerHighest.withValues(alpha: 0.38),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelMedium?.copyWith(
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _ProgressRing extends StatelessWidget {
  const _ProgressRing({required this.progress, required this.accent});

  final double progress;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final value = (progress * 100).round().clamp(0, 100);

    return SizedBox(
      width: 46,
      height: 46,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CircularProgressIndicator(
            value: progress,
            strokeWidth: 4,
            backgroundColor: accent.withValues(alpha: 0.14),
            valueColor: AlwaysStoppedAnimation<Color>(accent),
          ),
          Text(
            '$value%',
            style: Theme.of(
              context,
            ).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}
