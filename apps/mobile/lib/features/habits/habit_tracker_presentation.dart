import 'package:flutter/material.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

const List<String> habitTrackerIconOptions = [
  'BookOpen',
  'Code2',
  'Droplets',
  'Dumbbell',
  'Flame',
  'Footprints',
  'Repeat',
  'ShieldPlus',
  'SlidersHorizontal',
  'Snowflake',
];

const List<String> habitTrackerColorOptions = [
  'BLUE',
  'CYAN',
  'GRAY',
  'GREEN',
  'INDIGO',
  'ORANGE',
  'PINK',
  'PURPLE',
  'RED',
  'YELLOW',
];

HabitTrackerFieldSchema _textField(
  String key,
  String label,
) => HabitTrackerFieldSchema(
  key: key,
  label: label,
  type: HabitTrackerFieldType.text,
);

HabitTrackerFieldSchema _booleanField(
  String key,
  String label,
) => HabitTrackerFieldSchema(
  key: key,
  label: label,
  type: HabitTrackerFieldType.boolean,
  required: true,
);

HabitTrackerTemplate _quickIncrementTemplate({
  required String id,
  required String name,
  required String description,
  required String color,
  required String icon,
  required double targetValue,
  required String key,
  required List<double> quickAddValues,
  String? unit,
  HabitTrackerTargetPeriod targetPeriod = HabitTrackerTargetPeriod.daily,
  HabitTrackerTrackingMode trackingMode = HabitTrackerTrackingMode.eventLog,
}) {
  return HabitTrackerTemplate(
    id: id,
    name: name,
    description: description,
    color: color,
    icon: icon,
    trackingMode: trackingMode,
    targetPeriod: targetPeriod,
    targetOperator: HabitTrackerTargetOperator.gte,
    targetValue: targetValue,
    primaryMetricKey: key,
    aggregationStrategy: trackingMode == HabitTrackerTrackingMode.dailySummary
        ? HabitTrackerAggregationStrategy.max
        : HabitTrackerAggregationStrategy.sum,
    quickAddValues: quickAddValues,
    inputSchema: [
      HabitTrackerFieldSchema(
        key: key,
        label: name,
        type: HabitTrackerFieldType.number,
        unit: unit,
        required: true,
      ),
    ],
    freezeAllowance: 1,
    recoveryWindowPeriods: 1,
    useCase: HabitTrackerUseCase.counter,
    templateCategory: HabitTrackerTemplateCategory.health,
    composerMode: HabitTrackerComposerMode.quickIncrement,
    composerConfig: HabitTrackerComposerConfig(
      unit: unit,
      suggestedIncrements: quickAddValues,
    ),
  );
}

HabitTrackerTemplate _wellnessCheckTemplate({
  required String id,
  required String name,
  required String description,
  required String color,
  required String icon,
  HabitTrackerTargetPeriod targetPeriod = HabitTrackerTargetPeriod.daily,
  double targetValue = 1,
  HabitTrackerAggregationStrategy aggregationStrategy =
      HabitTrackerAggregationStrategy.booleanAny,
}) {
  return HabitTrackerTemplate(
    id: id,
    name: name,
    description: description,
    color: color,
    icon: icon,
    trackingMode: HabitTrackerTrackingMode.eventLog,
    targetPeriod: targetPeriod,
    targetOperator: HabitTrackerTargetOperator.gte,
    targetValue: targetValue,
    primaryMetricKey: 'done',
    aggregationStrategy: aggregationStrategy,
    quickAddValues: const [],
    inputSchema: [_booleanField('done', 'Done')],
    freezeAllowance: 2,
    recoveryWindowPeriods: 1,
    useCase: HabitTrackerUseCase.wellnessCheck,
    templateCategory: HabitTrackerTemplateCategory.recovery,
    composerMode: HabitTrackerComposerMode.quickCheck,
    composerConfig: const HabitTrackerComposerConfig(
      progressVariant: HabitTrackerProgressVariant.check,
    ),
  );
}

HabitTrackerTemplate _measurementTemplate({
  required String id,
  required String name,
  required String description,
  required String color,
  required String icon,
  required double targetValue,
  required String key,
  required String unit,
  List<String> supportedUnits = const [],
  HabitTrackerTemplateCategory category = HabitTrackerTemplateCategory.health,
}) {
  return HabitTrackerTemplate(
    id: id,
    name: name,
    description: description,
    color: color,
    icon: icon,
    trackingMode: HabitTrackerTrackingMode.dailySummary,
    targetPeriod: HabitTrackerTargetPeriod.daily,
    targetOperator: HabitTrackerTargetOperator.gte,
    targetValue: targetValue,
    primaryMetricKey: key,
    aggregationStrategy: HabitTrackerAggregationStrategy.max,
    quickAddValues: const [],
    inputSchema: [
      HabitTrackerFieldSchema(
        key: key,
        label: name,
        type: HabitTrackerFieldType.number,
        unit: unit,
        required: true,
      ),
      _textField('note', 'Note'),
    ],
    freezeAllowance: 1,
    recoveryWindowPeriods: 1,
    useCase: id == 'body_weight'
        ? HabitTrackerUseCase.bodyWeight
        : HabitTrackerUseCase.measurement,
    templateCategory: category,
    composerMode: HabitTrackerComposerMode.measurement,
    composerConfig: HabitTrackerComposerConfig(
      unit: unit,
      supportedUnits: supportedUnits,
    ),
  );
}

HabitTrackerTemplate _workoutTemplate({
  required String id,
  required String name,
  required String description,
  required String color,
  required double targetValue,
  required List<String> suggestedExercises,
  int defaultSets = 4,
  int defaultReps = 8,
}) {
  return HabitTrackerTemplate(
    id: id,
    name: name,
    description: description,
    color: color,
    icon: 'Dumbbell',
    trackingMode: HabitTrackerTrackingMode.eventLog,
    targetPeriod: HabitTrackerTargetPeriod.weekly,
    targetOperator: HabitTrackerTargetOperator.gte,
    targetValue: targetValue,
    primaryMetricKey: 'session_count',
    aggregationStrategy: HabitTrackerAggregationStrategy.countEntries,
    quickAddValues: const [],
    inputSchema: const [
      HabitTrackerFieldSchema(
        key: 'session_count',
        label: 'Session',
        type: HabitTrackerFieldType.number,
      ),
      HabitTrackerFieldSchema(
        key: 'total_sets',
        label: 'Total sets',
        type: HabitTrackerFieldType.number,
      ),
      HabitTrackerFieldSchema(
        key: 'total_reps',
        label: 'Total reps',
        type: HabitTrackerFieldType.number,
      ),
      HabitTrackerFieldSchema(
        key: 'total_volume',
        label: 'Total volume',
        type: HabitTrackerFieldType.number,
        unit: 'kg',
      ),
    ],
    freezeAllowance: 1,
    recoveryWindowPeriods: 1,
    useCase: HabitTrackerUseCase.workoutSession,
    templateCategory: HabitTrackerTemplateCategory.strength,
    composerMode: HabitTrackerComposerMode.workoutSession,
    composerConfig: HabitTrackerComposerConfig(
      suggestedExercises: suggestedExercises,
      defaultSets: defaultSets,
      defaultReps: defaultReps,
      defaultWeightUnit: 'kg',
      supportedUnits: const ['kg', 'lb'],
    ),
  );
}

final List<HabitTrackerTemplate> habitTrackerTemplates = [
  const HabitTrackerTemplate(
    id: 'body_weight',
    name: 'Body Weight',
    description:
        'Log body weight with per-tracker units and a clean daily check-in.',
    color: 'INDIGO',
    icon: 'SlidersHorizontal',
    trackingMode: HabitTrackerTrackingMode.dailySummary,
    targetPeriod: HabitTrackerTargetPeriod.daily,
    targetOperator: HabitTrackerTargetOperator.gte,
    targetValue: 70,
    primaryMetricKey: 'weight',
    aggregationStrategy: HabitTrackerAggregationStrategy.max,
    quickAddValues: [],
    inputSchema: [
      HabitTrackerFieldSchema(
        key: 'weight',
        label: 'Weight',
        type: HabitTrackerFieldType.number,
        unit: 'kg',
        required: true,
      ),
      HabitTrackerFieldSchema(
        key: 'note',
        label: 'Note',
        type: HabitTrackerFieldType.text,
      ),
    ],
    freezeAllowance: 1,
    recoveryWindowPeriods: 1,
    useCase: HabitTrackerUseCase.bodyWeight,
    templateCategory: HabitTrackerTemplateCategory.health,
    composerMode: HabitTrackerComposerMode.measurement,
    composerConfig: HabitTrackerComposerConfig(
      unit: 'kg',
      supportedUnits: ['kg', 'lb'],
    ),
  ),
  _workoutTemplate(
    id: 'workout_session',
    name: 'Workout Session',
    description:
        'Capture a full workout with multiple exercise blocks, sets, reps, '
        'and weight.',
    color: 'RED',
    targetValue: 3,
    suggestedExercises: ['Bench Press', 'Squat', 'Deadlift', 'Row'],
  ),
  _workoutTemplate(
    id: 'strength_lift',
    name: 'Strength Lift',
    description:
        'Track a focused strength session with structured blocks for your '
        'main lifts.',
    color: 'ORANGE',
    targetValue: 4,
    suggestedExercises: [
      'Back Squat',
      'Bench Press',
      'Deadlift',
      'Overhead Press',
    ],
    defaultSets: 5,
    defaultReps: 5,
  ),
  _quickIncrementTemplate(
    id: 'push_ups',
    name: 'Push-Ups',
    description: 'Add reps fast and keep a visible daily target in reach.',
    color: 'GREEN',
    icon: 'Flame',
    targetValue: 100,
    key: 'count',
    quickAddValues: [10, 25, 50],
  ),
  _quickIncrementTemplate(
    id: 'pull_ups',
    name: 'Pull-Ups',
    description: 'Log small rep bursts quickly without leaving the Today list.',
    color: 'CYAN',
    icon: 'ShieldPlus',
    targetValue: 20,
    key: 'count',
    quickAddValues: [3, 5, 10],
  ),
  _quickIncrementTemplate(
    id: 'steps',
    name: 'Steps',
    description: 'Track movement volume as a clean rolling daily total.',
    color: 'GREEN',
    icon: 'Footprints',
    targetValue: 6000,
    key: 'steps',
    quickAddValues: [1000, 2000, 3000],
    trackingMode: HabitTrackerTrackingMode.dailySummary,
  ),
  _quickIncrementTemplate(
    id: 'water',
    name: 'Water',
    description:
        'Track hydration with quick chips that feel instant on the Today '
        'surface.',
    color: 'CYAN',
    icon: 'Droplets',
    targetValue: 8,
    key: 'glasses',
    unit: 'glass',
    quickAddValues: [1, 2, 3],
  ),
  _measurementTemplate(
    id: 'sleep',
    name: 'Sleep',
    description:
        'Record hours slept with a large numeric composer and gentle daily '
        'review.',
    color: 'PURPLE',
    icon: 'Snowflake',
    targetValue: 8,
    key: 'hours',
    unit: 'hours',
    category: HabitTrackerTemplateCategory.recovery,
  ),
  _wellnessCheckTemplate(
    id: 'stretching',
    name: 'Stretching',
    description: 'Mark daily mobility work complete in one tap.',
    color: 'YELLOW',
    icon: 'Footprints',
  ),
  _wellnessCheckTemplate(
    id: 'meditation',
    name: 'Meditation',
    description: 'Keep a calm daily ritual visible with a one-tap check-in.',
    color: 'INDIGO',
    icon: 'ShieldPlus',
  ),
  _wellnessCheckTemplate(
    id: 'sauna',
    name: 'Sauna',
    description: 'Track recovery sessions against a weekly target.',
    color: 'ORANGE',
    icon: 'Flame',
    targetPeriod: HabitTrackerTargetPeriod.weekly,
    targetValue: 3,
    aggregationStrategy: HabitTrackerAggregationStrategy.countEntries,
  ),
  _wellnessCheckTemplate(
    id: 'medication',
    name: 'Medication',
    description: 'Confirm medication adherence in a fast daily flow.',
    color: 'BLUE',
    icon: 'ShieldPlus',
  ),
  _wellnessCheckTemplate(
    id: 'no_social_media',
    name: 'No Social Media',
    description: 'Use a simple daily check when you held the line.',
    color: 'GRAY',
    icon: 'Repeat',
  ),
  const HabitTrackerTemplate(
    id: 'custom',
    name: 'Custom',
    description: 'Build a tracker for any repeated metric or ritual.',
    color: 'BLUE',
    icon: 'SlidersHorizontal',
    trackingMode: HabitTrackerTrackingMode.eventLog,
    targetPeriod: HabitTrackerTargetPeriod.daily,
    targetOperator: HabitTrackerTargetOperator.gte,
    targetValue: 1,
    primaryMetricKey: 'value',
    aggregationStrategy: HabitTrackerAggregationStrategy.sum,
    quickAddValues: [1],
    inputSchema: [
      HabitTrackerFieldSchema(
        key: 'value',
        label: 'Value',
        type: HabitTrackerFieldType.number,
        required: true,
      ),
      HabitTrackerFieldSchema(
        key: 'note',
        label: 'Note',
        type: HabitTrackerFieldType.text,
      ),
    ],
    freezeAllowance: 2,
    recoveryWindowPeriods: 1,
    composerConfig: HabitTrackerComposerConfig(
      progressVariant: HabitTrackerProgressVariant.bar,
    ),
  ),
];

HabitTrackerTemplate? habitTrackerTemplateById(String id) {
  for (final template in habitTrackerTemplates) {
    if (template.id == id) {
      return template;
    }
  }
  return null;
}

List<HabitTrackerTemplate> habitTrackerTemplatesForCategory(
  HabitTrackerTemplateCategory category,
) {
  return habitTrackerTemplates
      .where((template) => template.templateCategory == category)
      .toList(growable: false);
}

IconData habitTrackerIcon(String icon) {
  return switch (icon) {
    'BookOpen' => Icons.menu_book_outlined,
    'Code2' => Icons.code_outlined,
    'Droplets' => Icons.water_drop_outlined,
    'Dumbbell' => Icons.fitness_center_outlined,
    'Flame' => Icons.local_fire_department_outlined,
    'Footprints' => Icons.directions_walk_outlined,
    'ShieldPlus' => shad.LucideIcons.shieldPlus,
    'SlidersHorizontal' => Icons.tune_outlined,
    'Snowflake' => Icons.ac_unit_outlined,
    _ => Icons.repeat_rounded,
  };
}

Color habitTrackerColor(BuildContext context, String color) {
  return switch (color.toUpperCase()) {
    'CYAN' => Colors.cyan.shade600,
    'GRAY' => Colors.blueGrey.shade500,
    'GREEN' => Colors.green.shade600,
    'INDIGO' => Colors.indigo.shade500,
    'ORANGE' => Colors.orange.shade700,
    'PINK' => Colors.pink.shade400,
    'PURPLE' => Colors.purple.shade500,
    'RED' => Colors.red.shade600,
    'YELLOW' => Colors.amber.shade700,
    _ => Colors.blue.shade600,
  };
}

Color habitTrackerTint(BuildContext context, String color) {
  return habitTrackerColor(context, color).withValues(alpha: 0.12);
}

HabitTrackerFieldSchema? primaryFieldForTracker(HabitTracker tracker) {
  for (final field in tracker.inputSchema) {
    if (field.key == tracker.primaryMetricKey) {
      return field;
    }
  }
  return tracker.inputSchema.isEmpty ? null : tracker.inputSchema.first;
}

String slugifyHabitFieldKey(String value) {
  final normalized = value
      .trim()
      .toLowerCase()
      .replaceAll(RegExp('[^a-z0-9]+'), '_')
      .replaceAll(RegExp(r'^_+|_+$'), '');

  return normalized.isEmpty ? 'value' : normalized;
}

List<double> normalizeQuickAddValues(Iterable<double> values) {
  final normalized =
      values
          .where((value) => value.isFinite && value > 0)
          .map(
            (value) => double.parse(
              value.toStringAsFixed(value.truncateToDouble() == value ? 0 : 2),
            ),
          )
          .toSet()
          .toList(growable: false)
        ..sort();
  return normalized;
}

String formatCompactNumber(num value) {
  final absolute = value.abs();
  if (absolute >= 1000) {
    if (absolute >= 1000000) {
      final formatted = (value / 1000000)
          .toStringAsFixed(1)
          .replaceAll(RegExp(r'\.0$'), '');
      return '${formatted}M';
    }
    final formatted = (value / 1000)
        .toStringAsFixed(1)
        .replaceAll(RegExp(r'\.0$'), '');
    return '${formatted}K';
  }
  if (value % 1 == 0) {
    return value.toStringAsFixed(0);
  }
  return value.toStringAsFixed(1).replaceAll(RegExp(r'\.0$'), '');
}

String formatFieldValue(HabitTrackerFieldSchema? field, Object? value) {
  if (value == null) {
    return '-';
  }
  if (field?.type == HabitTrackerFieldType.boolean) {
    return value == true ? 'Yes' : 'No';
  }
  if (value is num) {
    final formatted = formatCompactNumber(value);
    if (field?.unit != null && field!.unit!.trim().isNotEmpty) {
      return '$formatted ${field.unit}';
    }
    return formatted;
  }
  if (value is List<HabitTrackerExerciseBlock>) {
    return '${value.length} exercises';
  }
  return value.toString();
}

class HabitTrackerSummaryMetrics {
  const HabitTrackerSummaryMetrics({
    required this.currentVolume,
    required this.metTarget,
    required this.topStreak,
    required this.totalTrackers,
  });

  final double currentVolume;
  final int metTarget;
  final int topStreak;
  final int totalTrackers;
}

HabitTrackerSummaryMetrics buildHabitSummaryMetrics(
  List<HabitTrackerCardSummary> trackers,
  HabitTrackerScope scope,
) {
  final currentVolume = trackers.fold<double>(0, (sum, tracker) {
    if (scope == HabitTrackerScope.team) {
      return sum + (tracker.team?.totalValue ?? 0);
    }
    return sum + (tracker.currentMember?.currentPeriodTotal ?? 0);
  });
  final metTarget = trackers.where((tracker) {
    final current = scope == HabitTrackerScope.team
        ? (tracker.team?.totalValue ?? 0)
        : (tracker.currentMember?.currentPeriodTotal ?? 0);
    return current >= tracker.tracker.targetValue;
  }).length;
  final topStreak = trackers.fold<int>(0, (top, tracker) {
    final streak = scope == HabitTrackerScope.team
        ? (tracker.team?.topStreak ?? 0)
        : (tracker.currentMember?.streak.currentStreak ?? 0);
    return streak > top ? streak : top;
  });

  return HabitTrackerSummaryMetrics(
    currentVolume: currentVolume,
    metTarget: metTarget,
    topStreak: topStreak,
    totalTrackers: trackers.length,
  );
}
