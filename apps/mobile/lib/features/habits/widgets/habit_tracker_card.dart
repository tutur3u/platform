import 'package:flutter/material.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/features/habits/habit_tracker_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class HabitTrackerCard extends StatelessWidget {
  const HabitTrackerCard({
    required this.summary,
    required this.scope,
    required this.quickValue,
    required this.onQuickValueChanged,
    required this.onQuickLog,
    required this.onSelect,
    required this.onEdit,
    this.selected = false,
    super.key,
  });

  final HabitTrackerCardSummary summary;
  final HabitTrackerScope scope;
  final String quickValue;
  final ValueChanged<String> onQuickValueChanged;
  final VoidCallback onQuickLog;
  final VoidCallback onSelect;
  final VoidCallback onEdit;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final tracker = summary.tracker;
    final primaryField = primaryFieldForTracker(tracker);
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
    final tint = habitTrackerTint(context, tracker.color);
    final l10n = context.l10n;

    return Material(
      color: selected ? tint.withValues(alpha: 0.2) : Colors.transparent,
      borderRadius: BorderRadius.circular(24),
      child: InkWell(
        onTap: onSelect,
        borderRadius: BorderRadius.circular(24),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: selected ? accent.withValues(alpha: 0.35) : Colors.black12,
            ),
            color: Theme.of(context).colorScheme.surface,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      color: tint,
                    ),
                    child: Icon(habitTrackerIcon(tracker.icon), color: accent),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tracker.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          tracker.description?.trim().isNotEmpty == true
                              ? tracker.description!.trim()
                              : l10n.habitsTrackerNoDescription,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.color
                                    ?.withValues(alpha: 0.72),
                              ),
                        ),
                      ],
                    ),
                  ),
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
                  _MetricChip(
                    label: l10n.habitsTargetChip(tracker.targetValue),
                  ),
                  _MetricChip(
                    label:
                        tracker.trackingMode ==
                            HabitTrackerTrackingMode.dailySummary
                        ? l10n.habitsModeDailySummary
                        : l10n.habitsModeEventLog,
                  ),
                  _MetricChip(label: l10n.habitsStreakChip(streak)),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                [
                  '${formatCompactNumber(currentPeriodValue)} / ${formatCompactNumber(tracker.targetValue)}',
                  if (primaryField?.unit != null &&
                      primaryField!.unit!.isNotEmpty)
                    primaryField.unit!,
                ].join(' '),
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 8,
                  backgroundColor: accent.withValues(alpha: 0.12),
                  valueColor: AlwaysStoppedAnimation<Color>(accent),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _StatTile(
                      label: l10n.habitsCurrentStreak,
                      value: '$streak',
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _StatTile(
                      label: l10n.habitsBestStreak,
                      value: '${summary.currentMember?.streak.bestStreak ?? 0}',
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _StatTile(
                      label: l10n.habitsTeamMembers,
                      value: '${summary.team?.activeMembers ?? 0}',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              _QuickLogSection(
                tracker: tracker,
                quickValue: quickValue,
                onQuickValueChanged: onQuickValueChanged,
                onQuickLog: onQuickLog,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MetricChip extends StatelessWidget {
  const _MetricChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
      ),
      child: Text(label, style: Theme.of(context).textTheme.labelMedium),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: Theme.of(context).colorScheme.surfaceContainerLow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: Theme.of(
                context,
              ).textTheme.labelSmall?.color?.withValues(alpha: 0.75),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: Theme.of(
              context,
            ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _QuickLogSection extends StatelessWidget {
  const _QuickLogSection({
    required this.tracker,
    required this.quickValue,
    required this.onQuickValueChanged,
    required this.onQuickLog,
  });

  final HabitTracker tracker;
  final String quickValue;
  final ValueChanged<String> onQuickValueChanged;
  final VoidCallback onQuickLog;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final primaryField = primaryFieldForTracker(tracker);
    final isBoolean = primaryField?.type == HabitTrackerFieldType.boolean;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.black12),
        color: Theme.of(context).colorScheme.surfaceContainerLowest,
      ),
      child: isBoolean
          ? shad.PrimaryButton(
              onPressed: onQuickLog,
              child: Text(l10n.habitsCompleteNow),
            )
          : tracker.trackingMode == HabitTrackerTrackingMode.dailySummary
          ? Row(
              children: [
                Expanded(
                  child: TextFormField(
                    initialValue: quickValue,
                    decoration: InputDecoration(
                      hintText: l10n.habitsTodayTotalHint,
                    ),
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    onChanged: onQuickValueChanged,
                  ),
                ),
                const SizedBox(width: 8),
                shad.PrimaryButton(
                  onPressed: onQuickLog,
                  child: Text(l10n.assistantSaveAction),
                ),
              ],
            )
          : Wrap(
              spacing: 8,
              runSpacing: 8,
              children: tracker.quickAddValues
                  .map((value) {
                    return shad.OutlineButton(
                      onPressed: () {
                        onQuickValueChanged(value.toString());
                        onQuickLog();
                      },
                      child: Text(
                        [
                          '+${formatCompactNumber(value)}',
                          if (primaryField?.unit != null &&
                              primaryField!.unit!.isNotEmpty)
                            primaryField.unit!,
                        ].join(' '),
                      ),
                    );
                  })
                  .toList(growable: false),
            ),
    );
  }
}
