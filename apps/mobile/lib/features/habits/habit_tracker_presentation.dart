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

const List<HabitTrackerTemplate> habitTrackerTemplates = [
  HabitTrackerTemplate(
    id: 'water',
    name: 'Water',
    description: 'Track daily hydration with quick-add amounts.',
    color: 'CYAN',
    icon: 'Droplets',
    trackingMode: HabitTrackerTrackingMode.eventLog,
    targetPeriod: HabitTrackerTargetPeriod.daily,
    targetOperator: HabitTrackerTargetOperator.gte,
    targetValue: 8,
    primaryMetricKey: 'glasses',
    aggregationStrategy: HabitTrackerAggregationStrategy.sum,
    quickAddValues: [1, 2, 3],
    inputSchema: [
      HabitTrackerFieldSchema(
        key: 'glasses',
        label: 'Glasses',
        type: HabitTrackerFieldType.number,
        unit: 'glass',
        required: true,
      ),
      HabitTrackerFieldSchema(
        key: 'note',
        label: 'Context',
        type: HabitTrackerFieldType.text,
      ),
    ],
    freezeAllowance: 2,
    recoveryWindowPeriods: 1,
  ),
  HabitTrackerTemplate(
    id: 'gym',
    name: 'Gym',
    description: 'Log sets, reps, and weight for each workout block.',
    color: 'RED',
    icon: 'Dumbbell',
    trackingMode: HabitTrackerTrackingMode.eventLog,
    targetPeriod: HabitTrackerTargetPeriod.weekly,
    targetOperator: HabitTrackerTargetOperator.gte,
    targetValue: 4,
    primaryMetricKey: 'sets',
    aggregationStrategy: HabitTrackerAggregationStrategy.sum,
    quickAddValues: [3, 4, 5],
    inputSchema: [
      HabitTrackerFieldSchema(
        key: 'sets',
        label: 'Sets',
        type: HabitTrackerFieldType.number,
        required: true,
      ),
      HabitTrackerFieldSchema(
        key: 'reps',
        label: 'Reps',
        type: HabitTrackerFieldType.number,
      ),
      HabitTrackerFieldSchema(
        key: 'weight',
        label: 'Weight',
        type: HabitTrackerFieldType.number,
        unit: 'kg',
      ),
      HabitTrackerFieldSchema(
        key: 'focus',
        label: 'Focus',
        type: HabitTrackerFieldType.text,
      ),
    ],
    freezeAllowance: 1,
    recoveryWindowPeriods: 1,
  ),
  HabitTrackerTemplate(
    id: 'reading',
    name: 'Reading',
    description: 'Track pages or chapters finished and capture reflections.',
    color: 'PURPLE',
    icon: 'BookOpen',
    trackingMode: HabitTrackerTrackingMode.dailySummary,
    targetPeriod: HabitTrackerTargetPeriod.daily,
    targetOperator: HabitTrackerTargetOperator.gte,
    targetValue: 20,
    primaryMetricKey: 'pages',
    aggregationStrategy: HabitTrackerAggregationStrategy.sum,
    quickAddValues: [10, 20, 30],
    inputSchema: [
      HabitTrackerFieldSchema(
        key: 'pages',
        label: 'Pages',
        type: HabitTrackerFieldType.number,
        unit: 'page',
        required: true,
      ),
      HabitTrackerFieldSchema(
        key: 'book',
        label: 'Book',
        type: HabitTrackerFieldType.text,
      ),
    ],
    freezeAllowance: 2,
    recoveryWindowPeriods: 1,
  ),
  HabitTrackerTemplate(
    id: 'leetcode',
    name: 'LeetCode',
    description: 'Log solved problems and difficulty for deliberate practice.',
    color: 'ORANGE',
    icon: 'Code2',
    trackingMode: HabitTrackerTrackingMode.eventLog,
    targetPeriod: HabitTrackerTargetPeriod.daily,
    targetOperator: HabitTrackerTargetOperator.gte,
    targetValue: 1,
    primaryMetricKey: 'problems',
    aggregationStrategy: HabitTrackerAggregationStrategy.sum,
    quickAddValues: [1, 2, 3],
    inputSchema: [
      HabitTrackerFieldSchema(
        key: 'problems',
        label: 'Problems',
        type: HabitTrackerFieldType.number,
        required: true,
      ),
      HabitTrackerFieldSchema(
        key: 'difficulty',
        label: 'Difficulty',
        type: HabitTrackerFieldType.select,
        required: true,
        options: [
          HabitTrackerFieldOption(label: 'Easy', value: 'easy'),
          HabitTrackerFieldOption(label: 'Medium', value: 'medium'),
          HabitTrackerFieldOption(label: 'Hard', value: 'hard'),
        ],
      ),
      HabitTrackerFieldSchema(
        key: 'topic',
        label: 'Topic',
        type: HabitTrackerFieldType.text,
      ),
    ],
    freezeAllowance: 3,
    recoveryWindowPeriods: 2,
  ),
  HabitTrackerTemplate(
    id: 'steps',
    name: 'Steps',
    description: 'Track movement volume as a single daily number.',
    color: 'GREEN',
    icon: 'Footprints',
    trackingMode: HabitTrackerTrackingMode.dailySummary,
    targetPeriod: HabitTrackerTargetPeriod.daily,
    targetOperator: HabitTrackerTargetOperator.gte,
    targetValue: 10000,
    primaryMetricKey: 'steps',
    aggregationStrategy: HabitTrackerAggregationStrategy.max,
    quickAddValues: [2000, 5000, 10000],
    inputSchema: [
      HabitTrackerFieldSchema(
        key: 'steps',
        label: 'Steps',
        type: HabitTrackerFieldType.number,
        required: true,
      ),
    ],
    freezeAllowance: 1,
    recoveryWindowPeriods: 1,
  ),
  HabitTrackerTemplate(
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
    if (scope == HabitTrackerScope.team) {
      return (tracker.team?.totalEntries ?? 0) > 0;
    }
    return (tracker.currentMember?.currentPeriodTotal ?? 0) >=
        tracker.tracker.targetValue;
  }).length;

  final topStreak = trackers.fold<int>(0, (current, tracker) {
    final next = scope == HabitTrackerScope.team
        ? (tracker.team?.topStreak ?? 0)
        : (tracker.currentMember?.streak.currentStreak ?? 0);
    return next > current ? next : current;
  });

  return HabitTrackerSummaryMetrics(
    currentVolume: currentVolume,
    metTarget: metTarget,
    topStreak: topStreak,
    totalTrackers: trackers.length,
  );
}
