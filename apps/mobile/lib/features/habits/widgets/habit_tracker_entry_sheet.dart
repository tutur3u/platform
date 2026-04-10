import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/habits/habit_tracker_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class HabitTrackerEntrySheet extends StatefulWidget {
  const HabitTrackerEntrySheet({
    required this.detail,
    required this.onSubmit,
    super.key,
  });

  final HabitTrackerDetailResponse detail;
  final Future<void> Function(HabitTrackerEntryInput input) onSubmit;

  @override
  State<HabitTrackerEntrySheet> createState() => _HabitTrackerEntrySheetState();
}

class _WorkoutBlockDraft {
  _WorkoutBlockDraft({
    this.sets = 4,
    this.reps = 8,
    this.unit,
  });

  String exerciseName = '';
  int sets;
  int reps;
  String weight = '';
  String? unit;
  String notes = '';

  HabitTrackerExerciseBlock? toBlock() {
    final name = exerciseName.trim();
    if (name.isEmpty) {
      return null;
    }
    final parsedWeight = weight.trim().isEmpty ? null : double.tryParse(weight);
    return HabitTrackerExerciseBlock(
      exerciseName: name,
      sets: sets,
      reps: reps,
      weight: parsedWeight,
      unit: unit,
      notes: notes.trim().isEmpty ? null : notes.trim(),
    );
  }
}

class _HabitTrackerEntrySheetState extends State<HabitTrackerEntrySheet> {
  late final TextEditingController _dateController;
  late final TextEditingController _noteController;
  late final TextEditingController _tagsController;
  late final TextEditingController _primaryValueController;
  late final List<_WorkoutBlockDraft> _workoutBlocks;
  late bool _checkValue;
  bool _isSubmitting = false;

  HabitTracker get _tracker => widget.detail.tracker;
  HabitTrackerEntry? get _latestEntry =>
      widget.detail.entries.isEmpty ? null : widget.detail.entries.first;

  @override
  void initState() {
    super.initState();
    _dateController = TextEditingController(
      text: DateTime.now().toIso8601String().slice(0, 10),
    );
    _noteController = TextEditingController();
    _tagsController = TextEditingController();
    _primaryValueController = TextEditingController();
    _checkValue = false;
    _workoutBlocks = [
      _WorkoutBlockDraft(
        sets: _tracker.composerConfig.defaultSets ?? 4,
        reps: _tracker.composerConfig.defaultReps ?? 8,
        unit:
            _tracker.composerConfig.defaultWeightUnit ??
            _tracker.composerConfig.unit,
      ),
    ];
  }

  @override
  void dispose() {
    _dateController.dispose();
    _noteController.dispose();
    _tagsController.dispose();
    _primaryValueController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _EntrySheetContainer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Header(
            tracker: _tracker,
            isSubmitting: _isSubmitting,
          ),
          const SizedBox(height: 20),
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _DateField(
                    controller: _dateController,
                    onTap: _pickDate,
                  ),
                  const SizedBox(height: 16),
                  _buildComposer(context),
                  const SizedBox(height: 16),
                  _LabeledField(
                    label: context.l10n.habitsEntryNoteLabel,
                    child: TextField(
                      controller: _noteController,
                      minLines: 3,
                      maxLines: 5,
                    ),
                  ),
                  const SizedBox(height: 16),
                  _LabeledField(
                    label: context.l10n.habitsEntryTagsLabel,
                    child: TextField(
                      controller: _tagsController,
                      decoration: InputDecoration(
                        hintText: context.l10n.habitsEntryTagsHint,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: shad.OutlineButton(
                  onPressed: _isSubmitting
                      ? null
                      : () => Navigator.of(context).maybePop(),
                  child: SizedBox(
                    width: double.infinity,
                    child: Text(
                      context.l10n.commonCancel,
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: shad.PrimaryButton(
                  onPressed: _isSubmitting ? null : _submit,
                  child: _isSubmitting
                      ? const Center(
                          child: SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      : SizedBox(
                          width: double.infinity,
                          child: Text(
                            context.l10n.habitsSaveEntry,
                            textAlign: TextAlign.center,
                          ),
                        ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildComposer(BuildContext context) {
    return switch (_tracker.composerMode) {
      HabitTrackerComposerMode.quickCheck => _QuickCheckComposer(
        tracker: _tracker,
        value: _checkValue,
        onChanged: (value) => setState(() => _checkValue = value),
      ),
      HabitTrackerComposerMode.quickIncrement => _QuickIncrementComposer(
        tracker: _tracker,
        controller: _primaryValueController,
        latestEntry: _latestEntry,
        onIncrement: _applyIncrement,
      ),
      HabitTrackerComposerMode.measurement => _MeasurementComposer(
        tracker: _tracker,
        controller: _primaryValueController,
        latestEntry: _latestEntry,
      ),
      HabitTrackerComposerMode.workoutSession => _WorkoutSessionComposer(
        tracker: _tracker,
        blocks: _workoutBlocks,
        onAddBlock: _addWorkoutBlock,
        onRemoveBlock: _removeWorkoutBlock,
        onChanged: () => setState(() {}),
      ),
      HabitTrackerComposerMode.advancedCustom => _AdvancedComposer(
        tracker: _tracker,
        controller: _primaryValueController,
      ),
    };
  }

  void _applyIncrement(double amount) {
    final current = double.tryParse(_primaryValueController.text.trim()) ?? 0;
    _primaryValueController.text = formatCompactNumber(current + amount);
  }

  void _addWorkoutBlock() {
    setState(() {
      _workoutBlocks.add(
        _WorkoutBlockDraft(
          sets: _tracker.composerConfig.defaultSets ?? 4,
          reps: _tracker.composerConfig.defaultReps ?? 8,
          unit:
              _tracker.composerConfig.defaultWeightUnit ??
              _tracker.composerConfig.unit,
        ),
      );
    });
  }

  void _removeWorkoutBlock(_WorkoutBlockDraft block) {
    if (_workoutBlocks.length == 1) {
      return;
    }
    setState(() => _workoutBlocks.remove(block));
  }

  Future<void> _pickDate() async {
    final current = DateTime.tryParse(_dateController.text) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      _dateController.text = picked.toIso8601String().slice(0, 10);
    }
  }

  Future<void> _submit() async {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final values = <String, Object?>{};

    switch (_tracker.composerMode) {
      case HabitTrackerComposerMode.quickCheck:
        values[_tracker.primaryMetricKey] = _checkValue;
        break;
      case HabitTrackerComposerMode.quickIncrement:
      case HabitTrackerComposerMode.measurement:
      case HabitTrackerComposerMode.advancedCustom:
        final raw = _primaryValueController.text.trim().replaceAll(',', '');
        final parsed = double.tryParse(raw);
        if (parsed == null) {
          _showErrorToast(toastContext, context.l10n.habitsFormInvalidNumber);
          return;
        }
        values[_tracker.primaryMetricKey] = parsed;
        break;
      case HabitTrackerComposerMode.workoutSession:
        final blocks = _workoutBlocks
            .map((block) => block.toBlock())
            .whereType<HabitTrackerExerciseBlock>()
            .toList(growable: false);
        if (blocks.isEmpty) {
          _showErrorToast(
            toastContext,
            context.l10n.habitsWorkoutBlocksRequired,
          );
          return;
        }
        values['exercise_blocks'] = blocks;
        break;
    }

    setState(() => _isSubmitting = true);
    try {
      await widget.onSubmit(
        HabitTrackerEntryInput(
          entryDate: _dateController.text,
          values: values,
          note: _noteController.text.trim().isEmpty
              ? null
              : _noteController.text.trim(),
          tags: _tagsController.text
              .split(',')
              .map((value) => value.trim())
              .where((value) => value.isNotEmpty)
              .toList(growable: false),
        ),
      );
      if (!mounted) return;
      await Navigator.of(context).maybePop();
    } on ApiException catch (error) {
      if (toastContext.mounted) {
        _showErrorToast(toastContext, error.message);
      }
    } on Exception {
      if (toastContext.mounted) {
        _showErrorToast(
          toastContext,
          toastContext.l10n.commonSomethingWentWrong,
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  void _showErrorToast(BuildContext toastContext, String message) {
    shad.showToast(
      context: toastContext,
      builder: (toastContext, overlay) =>
          shad.Alert.destructive(content: Text(message)),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.tracker, required this.isSubmitting});

  final HabitTracker tracker;
  final bool isSubmitting;

  @override
  Widget build(BuildContext context) {
    final accent = habitTrackerColor(context, tracker.color);

    return Row(
      children: [
        Container(
          width: 48,
          height: 48,
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
                context.l10n.habitsLogEntryTitle,
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 4),
              Text(
                tracker.name,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
          ),
        ),
        IconButton(
          onPressed: isSubmitting
              ? null
              : () => Navigator.of(context).maybePop(),
          icon: const Icon(Icons.close),
        ),
      ],
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({required this.controller, required this.onTap});

  final TextEditingController controller;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _LabeledField(
      label: context.l10n.habitsEntryDateLabel,
      child: TextField(
        controller: controller,
        readOnly: true,
        onTap: onTap,
        decoration: const InputDecoration(
          suffixIcon: Icon(Icons.calendar_today_outlined),
        ),
      ),
    );
  }
}

class _QuickCheckComposer extends StatelessWidget {
  const _QuickCheckComposer({
    required this.tracker,
    required this.value,
    required this.onChanged,
  });

  final HabitTracker tracker;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final accent = habitTrackerColor(context, tracker.color);

    return FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.l10n.habitsQuickCheckTitle,
            style: shad.Theme.of(
              context,
            ).typography.large.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(
            context.l10n.habitsQuickCheckDescription,
            style: shad.Theme.of(context).typography.textSmall.copyWith(
              color: shad.Theme.of(context).colorScheme.mutedForeground,
            ),
          ),
          const SizedBox(height: 16),
          shad.PrimaryButton(
            onPressed: () => onChanged(!value),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  value ? Icons.check_circle_rounded : Icons.circle_outlined,
                  color: accent,
                ),
                const SizedBox(width: 10),
                Text(
                  value
                      ? context.l10n.habitsMarkedDone
                      : context.l10n.habitsMarkDone,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickIncrementComposer extends StatelessWidget {
  const _QuickIncrementComposer({
    required this.tracker,
    required this.controller,
    required this.latestEntry,
    required this.onIncrement,
  });

  final HabitTracker tracker;
  final TextEditingController controller;
  final HabitTrackerEntry? latestEntry;
  final ValueChanged<double> onIncrement;

  @override
  Widget build(BuildContext context) {
    final primaryField = primaryFieldForTracker(tracker);
    final previousValue = latestEntry?.values[tracker.primaryMetricKey] as num?;
    final increments = tracker.composerConfig.suggestedIncrements.isNotEmpty
        ? tracker.composerConfig.suggestedIncrements
        : tracker.quickAddValues;

    return FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _MeasurementHeader(
            title: context.l10n.habitsQuickIncrementTitle,
            subtitle: previousValue == null
                ? context.l10n.habitsQuickIncrementDescription
                : context.l10n.habitsLatestValueLabel(
                    formatFieldValue(primaryField, previousValue),
                  ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: controller,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              hintText: context.l10n.habitsTodayTotalHint,
              suffixText: primaryField?.unit,
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: increments
                .map(
                  (value) => shad.OutlineButton(
                    onPressed: () => onIncrement(value),
                    child: Text('+${formatCompactNumber(value)}'),
                  ),
                )
                .toList(growable: false),
          ),
        ],
      ),
    );
  }
}

class _MeasurementComposer extends StatelessWidget {
  const _MeasurementComposer({
    required this.tracker,
    required this.controller,
    required this.latestEntry,
  });

  final HabitTracker tracker;
  final TextEditingController controller;
  final HabitTrackerEntry? latestEntry;

  @override
  Widget build(BuildContext context) {
    final primaryField = primaryFieldForTracker(tracker);
    final previousValue = latestEntry?.values[tracker.primaryMetricKey] as num?;

    return FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _MeasurementHeader(
            title: context.l10n.habitsMeasurementTitle,
            subtitle: previousValue == null
                ? context.l10n.habitsMeasurementDescription
                : context.l10n.habitsLatestValueLabel(
                    formatFieldValue(primaryField, previousValue),
                  ),
          ),
          const SizedBox(height: 18),
          TextField(
            controller: controller,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            style: Theme.of(
              context,
            ).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w800),
            decoration: InputDecoration(
              hintText: '0',
              suffixText:
                  tracker.composerConfig.unit ??
                  primaryField?.unit ??
                  tracker.composerConfig.defaultWeightUnit,
            ),
          ),
        ],
      ),
    );
  }
}

class _AdvancedComposer extends StatelessWidget {
  const _AdvancedComposer({
    required this.tracker,
    required this.controller,
  });

  final HabitTracker tracker;
  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    final primaryField = primaryFieldForTracker(tracker);

    return FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _MeasurementHeader(
            title: context.l10n.habitsAdvancedComposerTitle,
            subtitle: context.l10n.habitsAdvancedComposerDescription,
          ),
          const SizedBox(height: 16),
          TextField(
            controller: controller,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              hintText: primaryField?.label ?? context.l10n.habitsNameLabel,
              suffixText: primaryField?.unit,
            ),
          ),
        ],
      ),
    );
  }
}

class _WorkoutSessionComposer extends StatelessWidget {
  const _WorkoutSessionComposer({
    required this.tracker,
    required this.blocks,
    required this.onAddBlock,
    required this.onRemoveBlock,
    required this.onChanged,
  });

  final HabitTracker tracker;
  final List<_WorkoutBlockDraft> blocks;
  final VoidCallback onAddBlock;
  final ValueChanged<_WorkoutBlockDraft> onRemoveBlock;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final totalSets = blocks.fold<int>(0, (sum, block) => sum + block.sets);
    final totalReps = blocks.fold<int>(
      0,
      (sum, block) => sum + (block.sets * block.reps),
    );
    final totalVolume = blocks.fold<double>(0, (sum, block) {
      final weight = double.tryParse(block.weight.trim()) ?? 0;
      return sum + (block.sets * block.reps * weight);
    });

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FinancePanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _MeasurementHeader(
                title: context.l10n.habitsWorkoutSessionTitle,
                subtitle: context.l10n.habitsWorkoutSessionDescription,
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  FinanceStatChip(
                    label: context.l10n.habitsWorkoutTotalSets,
                    value: '$totalSets',
                  ),
                  FinanceStatChip(
                    label: context.l10n.habitsWorkoutTotalReps,
                    value: '$totalReps',
                  ),
                  FinanceStatChip(
                    label: context.l10n.habitsWorkoutTotalVolume,
                    value: formatCompactNumber(totalVolume),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        ...blocks
            .map(
              (block) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _WorkoutBlockCard(
                  tracker: tracker,
                  block: block,
                  onRemove: () => onRemoveBlock(block),
                  onChanged: onChanged,
                ),
              ),
            )
            .toList(growable: false),
        shad.SecondaryButton(
          onPressed: onAddBlock,
          child: Text(context.l10n.habitsAddExerciseBlock),
        ),
      ],
    );
  }
}

class _WorkoutBlockCard extends StatelessWidget {
  const _WorkoutBlockCard({
    required this.tracker,
    required this.block,
    required this.onRemove,
    required this.onChanged,
  });

  final HabitTracker tracker;
  final _WorkoutBlockDraft block;
  final VoidCallback onRemove;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final units = tracker.composerConfig.supportedUnits.isEmpty
        ? <String>[
            tracker.composerConfig.defaultWeightUnit ??
                tracker.composerConfig.unit ??
                'kg',
          ]
        : tracker.composerConfig.supportedUnits;

    return FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  context.l10n.habitsWorkoutBlockTitle,
                  style: shad.Theme.of(
                    context,
                  ).typography.large.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              shad.IconButton.ghost(
                icon: const Icon(Icons.delete_outline_rounded),
                onPressed: onRemove,
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextFormField(
            initialValue: block.exerciseName,
            decoration: InputDecoration(
              labelText: context.l10n.habitsWorkoutExerciseName,
            ),
            onChanged: (value) {
              block.exerciseName = value;
              onChanged();
            },
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  initialValue: '${block.sets}',
                  decoration: InputDecoration(
                    labelText: context.l10n.habitsWorkoutSets,
                  ),
                  keyboardType: TextInputType.number,
                  onChanged: (value) {
                    block.sets = int.tryParse(value) ?? block.sets;
                    onChanged();
                  },
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextFormField(
                  initialValue: '${block.reps}',
                  decoration: InputDecoration(
                    labelText: context.l10n.habitsWorkoutReps,
                  ),
                  keyboardType: TextInputType.number,
                  onChanged: (value) {
                    block.reps = int.tryParse(value) ?? block.reps;
                    onChanged();
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  initialValue: block.weight,
                  decoration: InputDecoration(
                    labelText: context.l10n.habitsWorkoutWeight,
                  ),
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  onChanged: (value) {
                    block.weight = value;
                    onChanged();
                  },
                ),
              ),
              const SizedBox(width: 10),
              SizedBox(
                width: 120,
                child: DropdownButtonFormField<String>(
                  initialValue: block.unit ?? units.first,
                  items: units
                      .map(
                        (unit) => DropdownMenuItem<String>(
                          value: unit,
                          child: Text(unit),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: (value) {
                    block.unit = value;
                    onChanged();
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MeasurementHeader extends StatelessWidget {
  const _MeasurementHeader({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: shad.Theme.of(
            context,
          ).typography.large.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 6),
        Text(
          subtitle,
          style: shad.Theme.of(context).typography.textSmall.copyWith(
            color: shad.Theme.of(context).colorScheme.mutedForeground,
          ),
        ),
      ],
    );
  }
}

class _EntrySheetContainer extends StatelessWidget {
  const _EntrySheetContainer({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final height = context.isCompact
        ? MediaQuery.sizeOf(context).height * 0.9
        : 760.0;
    return SizedBox(
      height: height,
      child: Material(
        color: Theme.of(context).colorScheme.surface,
        child: Padding(padding: const EdgeInsets.all(20), child: child),
      ),
    );
  }
}

class _LabeledField extends StatelessWidget {
  const _LabeledField({required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(
            context,
          ).textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        child,
      ],
    );
  }
}

extension on String {
  String slice(int start, [int? end]) => substring(start, end);
}
