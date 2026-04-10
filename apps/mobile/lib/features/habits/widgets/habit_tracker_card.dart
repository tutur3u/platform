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

    return FinancePanel(
      borderColor: selected ? accent.withValues(alpha: 0.34) : null,
      backgroundColor: selected
          ? accent.withValues(alpha: 0.07)
          : FinancePalette.of(context).panel,
      onTap: onSelect,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  color: accent.withValues(alpha: 0.14),
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
                      style: shad.Theme.of(
                        context,
                      ).typography.large.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      tracker.description?.trim().isNotEmpty == true
                          ? tracker.description!.trim()
                          : context.l10n.habitsTrackerNoDescription,
                      maxLines: 2,
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
              const SizedBox(width: 12),
              _ProgressRing(progress: progress, accent: accent),
              const SizedBox(width: 4),
              shad.IconButton.ghost(
                icon: const Icon(Icons.settings_outlined),
                onPressed: onEdit,
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FinanceStatChip(
                label: context.l10n.habitsSummaryTargetsMet,
                value:
                    '${formatCompactNumber(currentPeriodValue)} / ${formatCompactNumber(tracker.targetValue)}',
                tint: accent,
              ),
              FinanceStatChip(
                label: context.l10n.habitsCurrentStreak,
                value: '$streak',
                tint: accent,
              ),
              FinanceStatChip(
                label: context.l10n.habitsLibraryComposerChip,
                value: _actionLabel(context, tracker),
                tint: accent,
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (primaryField != null)
            Text(
              primaryField.unit?.trim().isNotEmpty == true
                  ? '${primaryField.label} • ${primaryField.unit}'
                  : primaryField.label,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          const SizedBox(height: 10),
          _CardComposer(
            tracker: tracker,
            quickValue: quickValue,
            onQuickValueChanged: onQuickValueChanged,
            onQuickLog: onQuickLog,
          ),
        ],
      ),
    );
  }

  String _actionLabel(BuildContext context, HabitTracker tracker) {
    final l10n = context.l10n;
    return switch (tracker.composerMode) {
      HabitTrackerComposerMode.quickCheck => l10n.habitsComposerQuickCheck,
      HabitTrackerComposerMode.quickIncrement =>
        l10n.habitsComposerQuickIncrement,
      HabitTrackerComposerMode.measurement => l10n.habitsComposerMeasurement,
      HabitTrackerComposerMode.workoutSession =>
        l10n.habitsComposerWorkoutSession,
      HabitTrackerComposerMode.advancedCustom =>
        l10n.habitsComposerAdvancedCustom,
    };
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
      width: 52,
      height: 52,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CircularProgressIndicator(
            value: progress,
            strokeWidth: 5,
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

class _CardComposer extends StatefulWidget {
  const _CardComposer({
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
  State<_CardComposer> createState() => _CardComposerState();
}

class _CardComposerState extends State<_CardComposer> {
  late final TextEditingController _quickValueController;

  @override
  void initState() {
    super.initState();
    _quickValueController = TextEditingController(text: widget.quickValue);
  }

  @override
  void didUpdateWidget(covariant _CardComposer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.quickValue != widget.quickValue &&
        _quickValueController.text != widget.quickValue) {
      _quickValueController.value = TextEditingValue(
        text: widget.quickValue,
        selection: TextSelection.collapsed(offset: widget.quickValue.length),
      );
    }
  }

  @override
  void dispose() {
    _quickValueController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tracker = widget.tracker;
    final primaryField = primaryFieldForTracker(tracker);
    final increments = tracker.composerConfig.suggestedIncrements.isNotEmpty
        ? tracker.composerConfig.suggestedIncrements
        : tracker.quickAddValues;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.75),
        border: Border.all(
          color: Theme.of(
            context,
          ).colorScheme.outlineVariant.withValues(alpha: 0.55),
        ),
      ),
      child: switch (tracker.composerMode) {
        HabitTrackerComposerMode.quickCheck => shad.PrimaryButton(
          onPressed: widget.onQuickLog,
          child: Text(context.l10n.habitsCompleteNow),
        ),
        HabitTrackerComposerMode.quickIncrement => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _quickValueController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: InputDecoration(
                hintText: context.l10n.habitsTodayTotalHint,
                suffixText: primaryField?.unit,
              ),
              onChanged: widget.onQuickValueChanged,
            ),
            if (increments.isNotEmpty) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: increments
                    .map(
                      (value) => shad.OutlineButton(
                        onPressed: () {
                          final nextValue = value.toString();
                          _quickValueController.value = TextEditingValue(
                            text: nextValue,
                            selection: TextSelection.collapsed(
                              offset: nextValue.length,
                            ),
                          );
                          widget.onQuickValueChanged(nextValue);
                          widget.onQuickLog();
                        },
                        child: Text('+${formatCompactNumber(value)}'),
                      ),
                    )
                    .toList(growable: false),
              ),
            ],
            const SizedBox(height: 10),
            shad.PrimaryButton(
              onPressed: widget.onQuickLog,
              child: Text(context.l10n.assistantSaveAction),
            ),
          ],
        ),
        HabitTrackerComposerMode.measurement => shad.PrimaryButton(
          onPressed: widget.onQuickLog,
          child: Text(context.l10n.habitsLogMeasurementAction),
        ),
        HabitTrackerComposerMode.workoutSession => shad.PrimaryButton(
          onPressed: widget.onQuickLog,
          child: Text(context.l10n.habitsLogSessionAction),
        ),
        HabitTrackerComposerMode.advancedCustom => shad.PrimaryButton(
          onPressed: widget.onQuickLog,
          child: Text(context.l10n.habitsLogEntryAction),
        ),
      },
    );
  }
}
