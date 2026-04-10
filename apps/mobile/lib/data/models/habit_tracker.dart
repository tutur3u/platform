import 'package:equatable/equatable.dart';
import 'package:mobile/data/utils/date_utils.dart';

const _sentinel = Object();

enum HabitTrackerTrackingMode { eventLog, dailySummary }

enum HabitTrackerTargetPeriod { daily, weekly }

enum HabitTrackerTargetOperator { gte, eq }

enum HabitTrackerAggregationStrategy { sum, max, countEntries, booleanAny }

enum HabitTrackerFieldType { boolean, number, duration, text, select }

enum HabitTrackerEntryKind { eventLog, dailySummary }

enum HabitTrackerStreakActionType { freeze, repair }

enum HabitTrackerScope { self, team, member }

enum HabitTrackerUseCase {
  generic,
  bodyWeight,
  counter,
  measurement,
  workoutSession,
  wellnessCheck,
}

enum HabitTrackerTemplateCategory {
  strength,
  health,
  recovery,
  discipline,
  custom,
}

enum HabitTrackerComposerMode {
  quickCheck,
  quickIncrement,
  measurement,
  workoutSession,
  advancedCustom,
}

enum HabitTrackerProgressVariant { ring, bar, check }

HabitTrackerTrackingMode _trackingModeFromJson(Object? value) {
  return switch (value) {
    'daily_summary' => HabitTrackerTrackingMode.dailySummary,
    _ => HabitTrackerTrackingMode.eventLog,
  };
}

HabitTrackerTargetPeriod _targetPeriodFromJson(Object? value) {
  return switch (value) {
    'weekly' => HabitTrackerTargetPeriod.weekly,
    _ => HabitTrackerTargetPeriod.daily,
  };
}

HabitTrackerTargetOperator _targetOperatorFromJson(Object? value) {
  return switch (value) {
    'eq' => HabitTrackerTargetOperator.eq,
    _ => HabitTrackerTargetOperator.gte,
  };
}

HabitTrackerAggregationStrategy _aggregationStrategyFromJson(Object? value) {
  return switch (value) {
    'max' => HabitTrackerAggregationStrategy.max,
    'count_entries' => HabitTrackerAggregationStrategy.countEntries,
    'boolean_any' => HabitTrackerAggregationStrategy.booleanAny,
    _ => HabitTrackerAggregationStrategy.sum,
  };
}

HabitTrackerFieldType _fieldTypeFromJson(Object? value) {
  return switch (value) {
    'boolean' => HabitTrackerFieldType.boolean,
    'duration' => HabitTrackerFieldType.duration,
    'text' => HabitTrackerFieldType.text,
    'select' => HabitTrackerFieldType.select,
    _ => HabitTrackerFieldType.number,
  };
}

HabitTrackerEntryKind _entryKindFromJson(Object? value) {
  return switch (value) {
    'daily_summary' => HabitTrackerEntryKind.dailySummary,
    _ => HabitTrackerEntryKind.eventLog,
  };
}

HabitTrackerStreakActionType _streakActionTypeFromJson(Object? value) {
  return switch (value) {
    'repair' => HabitTrackerStreakActionType.repair,
    _ => HabitTrackerStreakActionType.freeze,
  };
}

HabitTrackerScope habitTrackerScopeFromJson(Object? value) {
  return switch (value) {
    'team' => HabitTrackerScope.team,
    'member' => HabitTrackerScope.member,
    _ => HabitTrackerScope.self,
  };
}

HabitTrackerUseCase _habitTrackerUseCaseFromJson(Object? value) {
  return switch (value) {
    'body_weight' => HabitTrackerUseCase.bodyWeight,
    'counter' => HabitTrackerUseCase.counter,
    'measurement' => HabitTrackerUseCase.measurement,
    'workout_session' => HabitTrackerUseCase.workoutSession,
    'wellness_check' => HabitTrackerUseCase.wellnessCheck,
    _ => HabitTrackerUseCase.generic,
  };
}

HabitTrackerTemplateCategory _habitTrackerTemplateCategoryFromJson(
  Object? value,
) {
  return switch (value) {
    'strength' => HabitTrackerTemplateCategory.strength,
    'health' => HabitTrackerTemplateCategory.health,
    'recovery' => HabitTrackerTemplateCategory.recovery,
    'discipline' => HabitTrackerTemplateCategory.discipline,
    _ => HabitTrackerTemplateCategory.custom,
  };
}

HabitTrackerComposerMode _habitTrackerComposerModeFromJson(Object? value) {
  return switch (value) {
    'quick_check' => HabitTrackerComposerMode.quickCheck,
    'quick_increment' => HabitTrackerComposerMode.quickIncrement,
    'measurement' => HabitTrackerComposerMode.measurement,
    'workout_session' => HabitTrackerComposerMode.workoutSession,
    _ => HabitTrackerComposerMode.advancedCustom,
  };
}

HabitTrackerProgressVariant _habitTrackerProgressVariantFromJson(
  Object? value,
) {
  return switch (value) {
    'bar' => HabitTrackerProgressVariant.bar,
    'check' => HabitTrackerProgressVariant.check,
    _ => HabitTrackerProgressVariant.ring,
  };
}

extension HabitTrackerTrackingModeApi on HabitTrackerTrackingMode {
  String get apiValue => switch (this) {
    HabitTrackerTrackingMode.eventLog => 'event_log',
    HabitTrackerTrackingMode.dailySummary => 'daily_summary',
  };
}

extension HabitTrackerTargetPeriodApi on HabitTrackerTargetPeriod {
  String get apiValue => switch (this) {
    HabitTrackerTargetPeriod.daily => 'daily',
    HabitTrackerTargetPeriod.weekly => 'weekly',
  };
}

extension HabitTrackerTargetOperatorApi on HabitTrackerTargetOperator {
  String get apiValue => switch (this) {
    HabitTrackerTargetOperator.gte => 'gte',
    HabitTrackerTargetOperator.eq => 'eq',
  };
}

extension HabitTrackerAggregationStrategyApi
    on HabitTrackerAggregationStrategy {
  String get apiValue => switch (this) {
    HabitTrackerAggregationStrategy.sum => 'sum',
    HabitTrackerAggregationStrategy.max => 'max',
    HabitTrackerAggregationStrategy.countEntries => 'count_entries',
    HabitTrackerAggregationStrategy.booleanAny => 'boolean_any',
  };
}

extension HabitTrackerFieldTypeApi on HabitTrackerFieldType {
  String get apiValue => switch (this) {
    HabitTrackerFieldType.boolean => 'boolean',
    HabitTrackerFieldType.number => 'number',
    HabitTrackerFieldType.duration => 'duration',
    HabitTrackerFieldType.text => 'text',
    HabitTrackerFieldType.select => 'select',
  };
}

extension HabitTrackerEntryKindApi on HabitTrackerEntryKind {
  String get apiValue => switch (this) {
    HabitTrackerEntryKind.eventLog => 'event_log',
    HabitTrackerEntryKind.dailySummary => 'daily_summary',
  };
}

extension HabitTrackerStreakActionTypeApi on HabitTrackerStreakActionType {
  String get apiValue => switch (this) {
    HabitTrackerStreakActionType.freeze => 'freeze',
    HabitTrackerStreakActionType.repair => 'repair',
  };
}

extension HabitTrackerScopeApi on HabitTrackerScope {
  String get apiValue => switch (this) {
    HabitTrackerScope.self => 'self',
    HabitTrackerScope.team => 'team',
    HabitTrackerScope.member => 'member',
  };
}

extension HabitTrackerUseCaseApi on HabitTrackerUseCase {
  String get apiValue => switch (this) {
    HabitTrackerUseCase.generic => 'generic',
    HabitTrackerUseCase.bodyWeight => 'body_weight',
    HabitTrackerUseCase.counter => 'counter',
    HabitTrackerUseCase.measurement => 'measurement',
    HabitTrackerUseCase.workoutSession => 'workout_session',
    HabitTrackerUseCase.wellnessCheck => 'wellness_check',
  };
}

extension HabitTrackerTemplateCategoryApi on HabitTrackerTemplateCategory {
  String get apiValue => switch (this) {
    HabitTrackerTemplateCategory.strength => 'strength',
    HabitTrackerTemplateCategory.health => 'health',
    HabitTrackerTemplateCategory.recovery => 'recovery',
    HabitTrackerTemplateCategory.discipline => 'discipline',
    HabitTrackerTemplateCategory.custom => 'custom',
  };
}

extension HabitTrackerComposerModeApi on HabitTrackerComposerMode {
  String get apiValue => switch (this) {
    HabitTrackerComposerMode.quickCheck => 'quick_check',
    HabitTrackerComposerMode.quickIncrement => 'quick_increment',
    HabitTrackerComposerMode.measurement => 'measurement',
    HabitTrackerComposerMode.workoutSession => 'workout_session',
    HabitTrackerComposerMode.advancedCustom => 'advanced_custom',
  };
}

extension HabitTrackerProgressVariantApi on HabitTrackerProgressVariant {
  String get apiValue => switch (this) {
    HabitTrackerProgressVariant.ring => 'ring',
    HabitTrackerProgressVariant.bar => 'bar',
    HabitTrackerProgressVariant.check => 'check',
  };
}

List<HabitTrackerExerciseBlock> _normalizeExerciseBlocks(Object? input) {
  if (input is! List) {
    return const [];
  }

  return input
      .whereType<Map<Object?, Object?>>()
      .map(
        (value) => HabitTrackerExerciseBlock.fromJson(
          Map<String, dynamic>.from(value),
        ),
      )
      .where((value) => value.exerciseName.isNotEmpty)
      .toList(growable: false);
}

Map<String, Object?> _normalizeEntryValues(Object? input) {
  if (input is! Map) {
    return const <String, Object?>{};
  }

  final values = <String, Object?>{};
  for (final entry in input.entries) {
    final key = entry.key;
    final value = entry.value;
    if (key is! String || key.trim().isEmpty) {
      continue;
    }
    if (value == null || value is bool || value is num || value is String) {
      values[key] = value;
      continue;
    }

    final exerciseBlocks = _normalizeExerciseBlocks(value);
    if (exerciseBlocks.isNotEmpty) {
      values[key] = exerciseBlocks;
    }
  }
  return Map.unmodifiable(values);
}

class HabitTrackerFieldOption extends Equatable {
  const HabitTrackerFieldOption({required this.label, required this.value});

  factory HabitTrackerFieldOption.fromJson(Map<String, dynamic> json) {
    return HabitTrackerFieldOption(
      label: (json['label'] as String? ?? '').trim(),
      value: (json['value'] as String? ?? '').trim(),
    );
  }

  final String label;
  final String value;

  Map<String, dynamic> toJson() => {'label': label, 'value': value};

  @override
  List<Object?> get props => [label, value];
}

class HabitTrackerFieldSchema extends Equatable {
  const HabitTrackerFieldSchema({
    required this.key,
    required this.label,
    required this.type,
    this.unit,
    this.required = false,
    this.options = const [],
  });

  factory HabitTrackerFieldSchema.fromJson(Map<String, dynamic> json) {
    final rawOptions = json['options'];
    return HabitTrackerFieldSchema(
      key: (json['key'] as String? ?? '').trim(),
      label: (json['label'] as String? ?? '').trim(),
      type: _fieldTypeFromJson(json['type']),
      unit: (json['unit'] as String?)?.trim(),
      required: json['required'] as bool? ?? false,
      options: rawOptions is List
          ? rawOptions
                .whereType<Map<Object?, Object?>>()
                .map(
                  (value) => HabitTrackerFieldOption.fromJson(
                    Map<String, dynamic>.from(value),
                  ),
                )
                .where(
                  (value) => value.label.isNotEmpty && value.value.isNotEmpty,
                )
                .toList(growable: false)
          : const [],
    );
  }

  final String key;
  final String label;
  final HabitTrackerFieldType type;
  final String? unit;
  final bool required;
  final List<HabitTrackerFieldOption> options;

  Map<String, dynamic> toJson() => {
    'key': key,
    'label': label,
    'type': type.apiValue,
    if (unit != null && unit!.trim().isNotEmpty) 'unit': unit,
    'required': required,
    if (options.isNotEmpty)
      'options': options.map((value) => value.toJson()).toList(growable: false),
  };

  @override
  List<Object?> get props => [key, label, type, unit, required, options];
}

class HabitTrackerComposerConfig extends Equatable {
  const HabitTrackerComposerConfig({
    this.unit,
    this.supportedUnits = const [],
    this.suggestedIncrements = const [],
    this.progressVariant = HabitTrackerProgressVariant.ring,
    this.suggestedExercises = const [],
    this.defaultSets,
    this.defaultReps,
    this.defaultWeightUnit,
  });

  factory HabitTrackerComposerConfig.fromJson(Map<String, dynamic> json) {
    return HabitTrackerComposerConfig(
      unit: (json['unit'] as String?)?.trim(),
      supportedUnits:
          (json['supported_units'] as List?)
              ?.whereType<String>()
              .map((value) => value.trim())
              .where((value) => value.isNotEmpty)
              .toList(growable: false) ??
          const [],
      suggestedIncrements:
          (json['suggested_increments'] as List?)
              ?.map((value) => (value as num?)?.toDouble())
              .whereType<double>()
              .toList(growable: false) ??
          const [],
      progressVariant: _habitTrackerProgressVariantFromJson(
        json['progress_variant'],
      ),
      suggestedExercises:
          (json['suggested_exercises'] as List?)
              ?.whereType<String>()
              .map((value) => value.trim())
              .where((value) => value.isNotEmpty)
              .toList(growable: false) ??
          const [],
      defaultSets: (json['default_sets'] as num?)?.toInt(),
      defaultReps: (json['default_reps'] as num?)?.toInt(),
      defaultWeightUnit: (json['default_weight_unit'] as String?)?.trim(),
    );
  }

  final String? unit;
  final List<String> supportedUnits;
  final List<double> suggestedIncrements;
  final HabitTrackerProgressVariant progressVariant;
  final List<String> suggestedExercises;
  final int? defaultSets;
  final int? defaultReps;
  final String? defaultWeightUnit;

  Map<String, dynamic> toJson() => {
    if (unit != null && unit!.trim().isNotEmpty) 'unit': unit!.trim(),
    if (supportedUnits.isNotEmpty) 'supported_units': supportedUnits,
    if (suggestedIncrements.isNotEmpty)
      'suggested_increments': suggestedIncrements,
    'progress_variant': progressVariant.apiValue,
    if (suggestedExercises.isNotEmpty)
      'suggested_exercises': suggestedExercises,
    if (defaultSets != null) 'default_sets': defaultSets,
    if (defaultReps != null) 'default_reps': defaultReps,
    if (defaultWeightUnit != null && defaultWeightUnit!.trim().isNotEmpty)
      'default_weight_unit': defaultWeightUnit!.trim(),
  };

  @override
  List<Object?> get props => [
    unit,
    supportedUnits,
    suggestedIncrements,
    progressVariant,
    suggestedExercises,
    defaultSets,
    defaultReps,
    defaultWeightUnit,
  ];
}

class HabitTrackerExerciseBlock extends Equatable {
  const HabitTrackerExerciseBlock({
    required this.exerciseName,
    required this.sets,
    required this.reps,
    this.weight,
    this.unit,
    this.notes,
  });

  factory HabitTrackerExerciseBlock.fromJson(Map<String, dynamic> json) {
    return HabitTrackerExerciseBlock(
      exerciseName: (json['exercise_name'] as String? ?? '').trim(),
      sets: (json['sets'] as num?)?.toInt() ?? 0,
      reps: (json['reps'] as num?)?.toInt() ?? 0,
      weight: (json['weight'] as num?)?.toDouble(),
      unit: (json['unit'] as String?)?.trim(),
      notes: (json['notes'] as String?)?.trim(),
    );
  }

  final String exerciseName;
  final int sets;
  final int reps;
  final double? weight;
  final String? unit;
  final String? notes;

  Map<String, dynamic> toJson() => {
    'exercise_name': exerciseName.trim(),
    'sets': sets,
    'reps': reps,
    if (weight != null) 'weight': weight,
    if (unit != null && unit!.trim().isNotEmpty) 'unit': unit!.trim(),
    if (notes != null && notes!.trim().isNotEmpty) 'notes': notes!.trim(),
  };

  @override
  List<Object?> get props => [exerciseName, sets, reps, weight, unit, notes];
}

class HabitTracker extends Equatable {
  const HabitTracker({
    required this.id,
    required this.wsId,
    required this.name,
    required this.color,
    required this.icon,
    required this.trackingMode,
    required this.targetPeriod,
    required this.targetOperator,
    required this.targetValue,
    required this.primaryMetricKey,
    required this.aggregationStrategy,
    required this.inputSchema,
    required this.quickAddValues,
    required this.freezeAllowance,
    required this.recoveryWindowPeriods,
    required this.startDate,
    required this.isActive,
    required this.createdAt,
    required this.updatedAt,
    this.useCase = HabitTrackerUseCase.generic,
    this.templateCategory = HabitTrackerTemplateCategory.custom,
    this.composerMode = HabitTrackerComposerMode.advancedCustom,
    this.composerConfig = const HabitTrackerComposerConfig(),
    this.description,
    this.createdBy,
    this.archivedAt,
  });

  factory HabitTracker.fromJson(Map<String, dynamic> json) {
    final rawSchema = json['input_schema'];
    final rawQuickValues = json['quick_add_values'];

    return HabitTracker(
      id: json['id'] as String,
      wsId: json['ws_id'] as String,
      name: json['name'] as String? ?? '',
      description: (json['description'] as String?)?.trim(),
      color: (json['color'] as String? ?? 'BLUE').toUpperCase(),
      icon: (json['icon'] as String? ?? 'Repeat').trim(),
      trackingMode: _trackingModeFromJson(json['tracking_mode']),
      targetPeriod: _targetPeriodFromJson(json['target_period']),
      targetOperator: _targetOperatorFromJson(json['target_operator']),
      targetValue: (json['target_value'] as num?)?.toDouble() ?? 0,
      primaryMetricKey: (json['primary_metric_key'] as String? ?? 'value')
          .trim(),
      aggregationStrategy: _aggregationStrategyFromJson(
        json['aggregation_strategy'],
      ),
      inputSchema: rawSchema is List
          ? rawSchema
                .whereType<Map<Object?, Object?>>()
                .map(
                  (value) => HabitTrackerFieldSchema.fromJson(
                    Map<String, dynamic>.from(value),
                  ),
                )
                .toList(growable: false)
          : const [],
      quickAddValues: rawQuickValues is List
          ? rawQuickValues
                .map((value) => (value as num?)?.toDouble())
                .whereType<double>()
                .toList(growable: false)
          : const [],
      freezeAllowance: (json['freeze_allowance'] as num?)?.toInt() ?? 0,
      recoveryWindowPeriods:
          (json['recovery_window_periods'] as num?)?.toInt() ?? 0,
      useCase: _habitTrackerUseCaseFromJson(json['use_case']),
      templateCategory: _habitTrackerTemplateCategoryFromJson(
        json['template_category'],
      ),
      composerMode: _habitTrackerComposerModeFromJson(json['composer_mode']),
      composerConfig: HabitTrackerComposerConfig.fromJson(
        Map<String, dynamic>.from(
          (json['composer_config'] as Map?) ?? const <String, dynamic>{},
        ),
      ),
      startDate: (json['start_date'] as String? ?? '').trim(),
      createdBy: json['created_by'] as String?,
      isActive: json['is_active'] as bool? ?? true,
      archivedAt: parseDateTime(json['archived_at']),
      createdAt: parseDateTime(json['created_at']) ?? DateTime.now(),
      updatedAt: parseDateTime(json['updated_at']) ?? DateTime.now(),
    );
  }

  final String id;
  final String wsId;
  final String name;
  final String? description;
  final String color;
  final String icon;
  final HabitTrackerTrackingMode trackingMode;
  final HabitTrackerTargetPeriod targetPeriod;
  final HabitTrackerTargetOperator targetOperator;
  final double targetValue;
  final String primaryMetricKey;
  final HabitTrackerAggregationStrategy aggregationStrategy;
  final List<HabitTrackerFieldSchema> inputSchema;
  final List<double> quickAddValues;
  final int freezeAllowance;
  final int recoveryWindowPeriods;
  final HabitTrackerUseCase useCase;
  final HabitTrackerTemplateCategory templateCategory;
  final HabitTrackerComposerMode composerMode;
  final HabitTrackerComposerConfig composerConfig;
  final String startDate;
  final String? createdBy;
  final bool isActive;
  final DateTime? archivedAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  @override
  List<Object?> get props => [
    id,
    wsId,
    name,
    description,
    color,
    icon,
    trackingMode,
    targetPeriod,
    targetOperator,
    targetValue,
    primaryMetricKey,
    aggregationStrategy,
    inputSchema,
    quickAddValues,
    freezeAllowance,
    recoveryWindowPeriods,
    useCase,
    templateCategory,
    composerMode,
    composerConfig,
    startDate,
    createdBy,
    isActive,
    archivedAt,
    createdAt,
    updatedAt,
  ];
}

class HabitTrackerMember extends Equatable {
  const HabitTrackerMember({
    required this.userId,
    required this.displayName,
    this.workspaceUserId,
    this.email,
    this.avatarUrl,
  });

  factory HabitTrackerMember.fromJson(Map<String, dynamic> json) {
    return HabitTrackerMember(
      userId: (json['user_id'] as String? ?? '').trim(),
      workspaceUserId: (json['workspace_user_id'] as String?)?.trim(),
      displayName: (json['display_name'] as String? ?? '').trim(),
      email: (json['email'] as String?)?.trim(),
      avatarUrl: (json['avatar_url'] as String?)?.trim(),
    );
  }

  final String userId;
  final String? workspaceUserId;
  final String displayName;
  final String? email;
  final String? avatarUrl;

  String get label {
    if (displayName.trim().isNotEmpty) {
      return displayName.trim();
    }
    if (email != null && email!.trim().isNotEmpty) {
      return email!.trim();
    }
    return userId;
  }

  @override
  List<Object?> get props => [
    userId,
    workspaceUserId,
    displayName,
    email,
    avatarUrl,
  ];
}

class HabitTrackerRecoveryWindowState extends Equatable {
  const HabitTrackerRecoveryWindowState({
    required this.eligible,
    this.periodStart,
    this.periodEnd,
    this.expiresOn,
    this.action,
  });

  factory HabitTrackerRecoveryWindowState.fromJson(Map<String, dynamic> json) {
    return HabitTrackerRecoveryWindowState(
      eligible: json['eligible'] as bool? ?? false,
      periodStart: (json['period_start'] as String?)?.trim(),
      periodEnd: (json['period_end'] as String?)?.trim(),
      expiresOn: (json['expires_on'] as String?)?.trim(),
      action: json['action'] == null
          ? null
          : _streakActionTypeFromJson(json['action']),
    );
  }

  final bool eligible;
  final String? periodStart;
  final String? periodEnd;
  final String? expiresOn;
  final HabitTrackerStreakActionType? action;

  @override
  List<Object?> get props => [
    eligible,
    periodStart,
    periodEnd,
    expiresOn,
    action,
  ];
}

class HabitTrackerStreakSummary extends Equatable {
  const HabitTrackerStreakSummary({
    required this.currentStreak,
    required this.bestStreak,
    required this.freezeCount,
    required this.freezesUsed,
    required this.perfectWeekCount,
    required this.consistencyRate,
    required this.recoveryWindow,
    this.lastSuccessDate,
  });

  factory HabitTrackerStreakSummary.fromJson(Map<String, dynamic> json) {
    return HabitTrackerStreakSummary(
      currentStreak: (json['current_streak'] as num?)?.toInt() ?? 0,
      bestStreak: (json['best_streak'] as num?)?.toInt() ?? 0,
      lastSuccessDate: (json['last_success_date'] as String?)?.trim(),
      freezeCount: (json['freeze_count'] as num?)?.toInt() ?? 0,
      freezesUsed: (json['freezes_used'] as num?)?.toInt() ?? 0,
      perfectWeekCount: (json['perfect_week_count'] as num?)?.toInt() ?? 0,
      consistencyRate: (json['consistency_rate'] as num?)?.toDouble() ?? 0,
      recoveryWindow: HabitTrackerRecoveryWindowState.fromJson(
        Map<String, dynamic>.from(
          (json['recovery_window'] as Map?) ?? const <String, dynamic>{},
        ),
      ),
    );
  }

  final int currentStreak;
  final int bestStreak;
  final String? lastSuccessDate;
  final int freezeCount;
  final int freezesUsed;
  final int perfectWeekCount;
  final double consistencyRate;
  final HabitTrackerRecoveryWindowState recoveryWindow;

  @override
  List<Object?> get props => [
    currentStreak,
    bestStreak,
    lastSuccessDate,
    freezeCount,
    freezesUsed,
    perfectWeekCount,
    consistencyRate,
    recoveryWindow,
  ];
}

class HabitTrackerMemberSummary extends Equatable {
  const HabitTrackerMemberSummary({
    required this.member,
    required this.total,
    required this.entryCount,
    required this.currentPeriodTotal,
    required this.streak,
    this.latestValue,
    this.latestEntryId,
    this.latestEntryDate,
    this.latestOccurredAt,
    this.latestValues,
  });

  factory HabitTrackerMemberSummary.fromJson(Map<String, dynamic> json) {
    return HabitTrackerMemberSummary(
      member: HabitTrackerMember.fromJson(
        Map<String, dynamic>.from(
          (json['member'] as Map?) ?? const <String, dynamic>{},
        ),
      ),
      total: (json['total'] as num?)?.toDouble() ?? 0,
      entryCount: (json['entry_count'] as num?)?.toInt() ?? 0,
      currentPeriodTotal:
          (json['current_period_total'] as num?)?.toDouble() ?? 0,
      latestValue: (json['latest_value'] as num?)?.toDouble(),
      latestEntryId: (json['latest_entry_id'] as String?)?.trim(),
      latestEntryDate: (json['latest_entry_date'] as String?)?.trim(),
      latestOccurredAt: parseDateTime(json['latest_occurred_at']),
      latestValues: json['latest_values'] == null
          ? null
          : _normalizeEntryValues(json['latest_values']),
      streak: HabitTrackerStreakSummary.fromJson(
        Map<String, dynamic>.from(
          (json['streak'] as Map?) ?? const <String, dynamic>{},
        ),
      ),
    );
  }

  final HabitTrackerMember member;
  final double total;
  final int entryCount;
  final double currentPeriodTotal;
  final double? latestValue;
  final String? latestEntryId;
  final String? latestEntryDate;
  final DateTime? latestOccurredAt;
  final Map<String, Object?>? latestValues;
  final HabitTrackerStreakSummary streak;

  HabitTrackerMemberSummary copyWith({
    HabitTrackerMember? member,
    double? total,
    int? entryCount,
    double? currentPeriodTotal,
    Object? latestValue = _sentinel,
    Object? latestEntryId = _sentinel,
    Object? latestEntryDate = _sentinel,
    Object? latestOccurredAt = _sentinel,
    Object? latestValues = _sentinel,
    HabitTrackerStreakSummary? streak,
  }) {
    return HabitTrackerMemberSummary(
      member: member ?? this.member,
      total: total ?? this.total,
      entryCount: entryCount ?? this.entryCount,
      currentPeriodTotal: currentPeriodTotal ?? this.currentPeriodTotal,
      latestValue: latestValue == _sentinel
          ? this.latestValue
          : latestValue as double?,
      latestEntryId: latestEntryId == _sentinel
          ? this.latestEntryId
          : latestEntryId as String?,
      latestEntryDate: latestEntryDate == _sentinel
          ? this.latestEntryDate
          : latestEntryDate as String?,
      latestOccurredAt: latestOccurredAt == _sentinel
          ? this.latestOccurredAt
          : latestOccurredAt as DateTime?,
      latestValues: latestValues == _sentinel
          ? this.latestValues
          : latestValues as Map<String, Object?>?,
      streak: streak ?? this.streak,
    );
  }

  @override
  List<Object?> get props => [
    member,
    total,
    entryCount,
    currentPeriodTotal,
    latestValue,
    latestEntryId,
    latestEntryDate,
    latestOccurredAt,
    Object.hashAllUnordered(latestValues?.entries ?? const []),
    streak,
  ];
}

class HabitTrackerLeaderboardRow extends Equatable {
  const HabitTrackerLeaderboardRow({
    required this.member,
    required this.currentStreak,
    required this.bestStreak,
    required this.consistencyRate,
    required this.currentPeriodTotal,
  });

  factory HabitTrackerLeaderboardRow.fromJson(Map<String, dynamic> json) {
    return HabitTrackerLeaderboardRow(
      member: HabitTrackerMember.fromJson(
        Map<String, dynamic>.from(
          (json['member'] as Map?) ?? const <String, dynamic>{},
        ),
      ),
      currentStreak: (json['current_streak'] as num?)?.toInt() ?? 0,
      bestStreak: (json['best_streak'] as num?)?.toInt() ?? 0,
      consistencyRate: (json['consistency_rate'] as num?)?.toDouble() ?? 0,
      currentPeriodTotal:
          (json['current_period_total'] as num?)?.toDouble() ?? 0,
    );
  }

  final HabitTrackerMember member;
  final int currentStreak;
  final int bestStreak;
  final double consistencyRate;
  final double currentPeriodTotal;

  @override
  List<Object?> get props => [
    member,
    currentStreak,
    bestStreak,
    consistencyRate,
    currentPeriodTotal,
  ];
}

class HabitTrackerTeamSummary extends Equatable {
  const HabitTrackerTeamSummary({
    required this.activeMembers,
    required this.totalEntries,
    required this.totalValue,
    required this.averageConsistencyRate,
    required this.topStreak,
  });

  factory HabitTrackerTeamSummary.fromJson(Map<String, dynamic> json) {
    return HabitTrackerTeamSummary(
      activeMembers: (json['active_members'] as num?)?.toInt() ?? 0,
      totalEntries: (json['total_entries'] as num?)?.toInt() ?? 0,
      totalValue: (json['total_value'] as num?)?.toDouble() ?? 0,
      averageConsistencyRate:
          (json['average_consistency_rate'] as num?)?.toDouble() ?? 0,
      topStreak: (json['top_streak'] as num?)?.toInt() ?? 0,
    );
  }

  final int activeMembers;
  final int totalEntries;
  final double totalValue;
  final double averageConsistencyRate;
  final int topStreak;

  HabitTrackerTeamSummary copyWith({
    int? activeMembers,
    int? totalEntries,
    double? totalValue,
    double? averageConsistencyRate,
    int? topStreak,
  }) {
    return HabitTrackerTeamSummary(
      activeMembers: activeMembers ?? this.activeMembers,
      totalEntries: totalEntries ?? this.totalEntries,
      totalValue: totalValue ?? this.totalValue,
      averageConsistencyRate:
          averageConsistencyRate ?? this.averageConsistencyRate,
      topStreak: topStreak ?? this.topStreak,
    );
  }

  @override
  List<Object?> get props => [
    activeMembers,
    totalEntries,
    totalValue,
    averageConsistencyRate,
    topStreak,
  ];
}

class HabitTrackerPeriodMetric extends Equatable {
  const HabitTrackerPeriodMetric({
    required this.periodStart,
    required this.periodEnd,
    required this.total,
    required this.success,
    required this.usedFreeze,
    required this.usedRepair,
    required this.entryCount,
  });

  factory HabitTrackerPeriodMetric.fromJson(Map<String, dynamic> json) {
    return HabitTrackerPeriodMetric(
      periodStart: (json['period_start'] as String? ?? '').trim(),
      periodEnd: (json['period_end'] as String? ?? '').trim(),
      total: (json['total'] as num?)?.toDouble() ?? 0,
      success: json['success'] as bool? ?? false,
      usedFreeze: json['used_freeze'] as bool? ?? false,
      usedRepair: json['used_repair'] as bool? ?? false,
      entryCount: (json['entry_count'] as num?)?.toInt() ?? 0,
    );
  }

  final String periodStart;
  final String periodEnd;
  final double total;
  final bool success;
  final bool usedFreeze;
  final bool usedRepair;
  final int entryCount;

  @override
  List<Object?> get props => [
    periodStart,
    periodEnd,
    total,
    success,
    usedFreeze,
    usedRepair,
    entryCount,
  ];
}

class HabitTrackerEntry extends Equatable {
  const HabitTrackerEntry({
    required this.id,
    required this.wsId,
    required this.trackerId,
    required this.userId,
    required this.entryKind,
    required this.entryDate,
    required this.values,
    required this.tags,
    required this.createdAt,
    required this.updatedAt,
    this.occurredAt,
    this.primaryValue,
    this.note,
    this.createdBy,
    this.member,
  });

  factory HabitTrackerEntry.fromJson(Map<String, dynamic> json) {
    return HabitTrackerEntry(
      id: json['id'] as String,
      wsId: json['ws_id'] as String,
      trackerId: json['tracker_id'] as String,
      userId: json['user_id'] as String,
      entryKind: _entryKindFromJson(json['entry_kind']),
      entryDate: (json['entry_date'] as String? ?? '').trim(),
      occurredAt: parseDateTime(json['occurred_at']),
      values: _normalizeEntryValues(json['values']),
      primaryValue: (json['primary_value'] as num?)?.toDouble(),
      note: (json['note'] as String?)?.trim(),
      tags:
          (json['tags'] as List?)
              ?.whereType<String>()
              .map((value) => value.trim())
              .where((value) => value.isNotEmpty)
              .toList(growable: false) ??
          const [],
      createdBy: (json['created_by'] as String?)?.trim(),
      createdAt: parseDateTime(json['created_at']) ?? DateTime.now(),
      updatedAt: parseDateTime(json['updated_at']) ?? DateTime.now(),
      member: json['member'] is Map
          ? HabitTrackerMember.fromJson(
              Map<String, dynamic>.from(json['member'] as Map),
            )
          : null,
    );
  }

  final String id;
  final String wsId;
  final String trackerId;
  final String userId;
  final HabitTrackerEntryKind entryKind;
  final String entryDate;
  final DateTime? occurredAt;
  final Map<String, Object?> values;
  final double? primaryValue;
  final String? note;
  final List<String> tags;
  final String? createdBy;
  final DateTime createdAt;
  final DateTime updatedAt;
  final HabitTrackerMember? member;

  int get valuesHash => Object.hashAllUnordered(
    values.entries.map((entry) => Object.hash(entry.key, entry.value)),
  );

  @override
  List<Object?> get props => [
    id,
    wsId,
    trackerId,
    userId,
    entryKind,
    entryDate,
    occurredAt,
    valuesHash,
    primaryValue,
    note,
    tags,
    createdBy,
    createdAt,
    updatedAt,
    member,
  ];
}

class HabitTrackerCardSummary extends Equatable {
  const HabitTrackerCardSummary({
    required this.tracker,
    required this.leaderboard,
    this.currentMember,
    this.team,
  });

  factory HabitTrackerCardSummary.fromJson(Map<String, dynamic> json) {
    return HabitTrackerCardSummary(
      tracker: HabitTracker.fromJson(
        Map<String, dynamic>.from(
          (json['tracker'] as Map?) ?? const <String, dynamic>{},
        ),
      ),
      currentMember: json['current_member'] is Map
          ? HabitTrackerMemberSummary.fromJson(
              Map<String, dynamic>.from(json['current_member'] as Map),
            )
          : null,
      team: json['team'] is Map
          ? HabitTrackerTeamSummary.fromJson(
              Map<String, dynamic>.from(json['team'] as Map),
            )
          : null,
      leaderboard:
          (json['leaderboard'] as List?)
              ?.whereType<Map<Object?, Object?>>()
              .map(
                (value) => HabitTrackerLeaderboardRow.fromJson(
                  Map<String, dynamic>.from(value),
                ),
              )
              .toList(growable: false) ??
          const [],
    );
  }

  final HabitTracker tracker;
  final HabitTrackerMemberSummary? currentMember;
  final HabitTrackerTeamSummary? team;
  final List<HabitTrackerLeaderboardRow> leaderboard;

  HabitTrackerCardSummary copyWith({
    HabitTracker? tracker,
    HabitTrackerMemberSummary? currentMember,
    HabitTrackerTeamSummary? team,
    List<HabitTrackerLeaderboardRow>? leaderboard,
  }) {
    return HabitTrackerCardSummary(
      tracker: tracker ?? this.tracker,
      currentMember: currentMember ?? this.currentMember,
      team: team ?? this.team,
      leaderboard: leaderboard ?? this.leaderboard,
    );
  }

  @override
  List<Object?> get props => [tracker, currentMember, team, leaderboard];
}

class HabitTrackerListResponse extends Equatable {
  const HabitTrackerListResponse({
    required this.trackers,
    required this.members,
    required this.scope,
    required this.viewerUserId,
    this.scopeUserId,
  });

  factory HabitTrackerListResponse.fromJson(Map<String, dynamic> json) {
    return HabitTrackerListResponse(
      trackers:
          (json['trackers'] as List?)
              ?.whereType<Map<Object?, Object?>>()
              .map(
                (value) => HabitTrackerCardSummary.fromJson(
                  Map<String, dynamic>.from(value),
                ),
              )
              .toList(growable: false) ??
          const [],
      members:
          (json['members'] as List?)
              ?.whereType<Map<Object?, Object?>>()
              .map(
                (value) => HabitTrackerMember.fromJson(
                  Map<String, dynamic>.from(value),
                ),
              )
              .toList(growable: false) ??
          const [],
      scope: habitTrackerScopeFromJson(json['scope']),
      scopeUserId:
          (json['scopeUserId'] as String?)?.trim() ??
          (json['scope_user_id'] as String?)?.trim(),
      viewerUserId:
          (json['viewerUserId'] as String?)?.trim() ??
          (json['viewer_user_id'] as String? ?? '').trim(),
    );
  }

  final List<HabitTrackerCardSummary> trackers;
  final List<HabitTrackerMember> members;
  final HabitTrackerScope scope;
  final String? scopeUserId;
  final String viewerUserId;

  HabitTrackerListResponse copyWith({
    List<HabitTrackerCardSummary>? trackers,
    List<HabitTrackerMember>? members,
    HabitTrackerScope? scope,
    String? scopeUserId,
    String? viewerUserId,
  }) {
    return HabitTrackerListResponse(
      trackers: trackers ?? this.trackers,
      members: members ?? this.members,
      scope: scope ?? this.scope,
      scopeUserId: scopeUserId ?? this.scopeUserId,
      viewerUserId: viewerUserId ?? this.viewerUserId,
    );
  }

  @override
  List<Object?> get props => [
    trackers,
    members,
    scope,
    scopeUserId,
    viewerUserId,
  ];
}

class HabitTrackerDetailResponse extends Equatable {
  const HabitTrackerDetailResponse({
    required this.tracker,
    required this.entries,
    required this.memberSummaries,
    required this.leaderboard,
    required this.currentPeriodMetrics,
    this.currentMember,
    this.team,
  });

  factory HabitTrackerDetailResponse.fromJson(Map<String, dynamic> json) {
    return HabitTrackerDetailResponse(
      tracker: HabitTracker.fromJson(
        Map<String, dynamic>.from(
          (json['tracker'] as Map?) ?? const <String, dynamic>{},
        ),
      ),
      entries:
          (json['entries'] as List?)
              ?.whereType<Map<Object?, Object?>>()
              .map(
                (value) => HabitTrackerEntry.fromJson(
                  Map<String, dynamic>.from(value),
                ),
              )
              .toList(growable: false) ??
          const [],
      currentMember: json['current_member'] is Map
          ? HabitTrackerMemberSummary.fromJson(
              Map<String, dynamic>.from(json['current_member'] as Map),
            )
          : null,
      team: json['team'] is Map
          ? HabitTrackerTeamSummary.fromJson(
              Map<String, dynamic>.from(json['team'] as Map),
            )
          : null,
      memberSummaries:
          (json['member_summaries'] as List?)
              ?.whereType<Map<Object?, Object?>>()
              .map(
                (value) => HabitTrackerMemberSummary.fromJson(
                  Map<String, dynamic>.from(value),
                ),
              )
              .toList(growable: false) ??
          const [],
      leaderboard:
          (json['leaderboard'] as List?)
              ?.whereType<Map<Object?, Object?>>()
              .map(
                (value) => HabitTrackerLeaderboardRow.fromJson(
                  Map<String, dynamic>.from(value),
                ),
              )
              .toList(growable: false) ??
          const [],
      currentPeriodMetrics:
          (json['current_period_metrics'] as List?)
              ?.whereType<Map<Object?, Object?>>()
              .map(
                (value) => HabitTrackerPeriodMetric.fromJson(
                  Map<String, dynamic>.from(value),
                ),
              )
              .toList(growable: false) ??
          const [],
    );
  }

  final HabitTracker tracker;
  final List<HabitTrackerEntry> entries;
  final HabitTrackerMemberSummary? currentMember;
  final HabitTrackerTeamSummary? team;
  final List<HabitTrackerMemberSummary> memberSummaries;
  final List<HabitTrackerLeaderboardRow> leaderboard;
  final List<HabitTrackerPeriodMetric> currentPeriodMetrics;

  HabitTrackerDetailResponse copyWith({
    HabitTracker? tracker,
    List<HabitTrackerEntry>? entries,
    HabitTrackerMemberSummary? currentMember,
    HabitTrackerTeamSummary? team,
    List<HabitTrackerMemberSummary>? memberSummaries,
    List<HabitTrackerLeaderboardRow>? leaderboard,
    List<HabitTrackerPeriodMetric>? currentPeriodMetrics,
  }) {
    return HabitTrackerDetailResponse(
      tracker: tracker ?? this.tracker,
      entries: entries ?? this.entries,
      currentMember: currentMember ?? this.currentMember,
      team: team ?? this.team,
      memberSummaries: memberSummaries ?? this.memberSummaries,
      leaderboard: leaderboard ?? this.leaderboard,
      currentPeriodMetrics: currentPeriodMetrics ?? this.currentPeriodMetrics,
    );
  }

  @override
  List<Object?> get props => [
    tracker,
    entries,
    currentMember,
    team,
    memberSummaries,
    leaderboard,
    currentPeriodMetrics,
  ];
}

class HabitTrackerInput extends Equatable {
  const HabitTrackerInput({
    required this.name,
    required this.color,
    required this.icon,
    required this.trackingMode,
    required this.targetPeriod,
    required this.targetOperator,
    required this.targetValue,
    required this.primaryMetricKey,
    required this.aggregationStrategy,
    required this.inputSchema,
    this.description,
    this.quickAddValues = const [],
    this.freezeAllowance = 0,
    this.recoveryWindowPeriods = 0,
    this.useCase = HabitTrackerUseCase.generic,
    this.templateCategory = HabitTrackerTemplateCategory.custom,
    this.composerMode = HabitTrackerComposerMode.advancedCustom,
    this.composerConfig = const HabitTrackerComposerConfig(),
    this.startDate,
    this.isActive = true,
  });

  final String name;
  final String? description;
  final String color;
  final String icon;
  final HabitTrackerTrackingMode trackingMode;
  final HabitTrackerTargetPeriod targetPeriod;
  final HabitTrackerTargetOperator targetOperator;
  final double targetValue;
  final String primaryMetricKey;
  final HabitTrackerAggregationStrategy aggregationStrategy;
  final List<HabitTrackerFieldSchema> inputSchema;
  final List<double> quickAddValues;
  final int freezeAllowance;
  final int recoveryWindowPeriods;
  final HabitTrackerUseCase useCase;
  final HabitTrackerTemplateCategory templateCategory;
  final HabitTrackerComposerMode composerMode;
  final HabitTrackerComposerConfig composerConfig;
  final String? startDate;
  final bool isActive;

  Map<String, dynamic> toJson() => {
    'name': name.trim(),
    if (description != null && description!.trim().isNotEmpty)
      'description': description!.trim(),
    'color': color.toUpperCase(),
    'icon': icon,
    'tracking_mode': trackingMode.apiValue,
    'target_period': targetPeriod.apiValue,
    'target_operator': targetOperator.apiValue,
    'target_value': targetValue,
    'primary_metric_key': primaryMetricKey.trim(),
    'aggregation_strategy': aggregationStrategy.apiValue,
    'input_schema': inputSchema
        .map((value) => value.toJson())
        .toList(growable: false),
    if (quickAddValues.isNotEmpty) 'quick_add_values': quickAddValues,
    'freeze_allowance': freezeAllowance,
    'recovery_window_periods': recoveryWindowPeriods,
    'use_case': useCase.apiValue,
    'template_category': templateCategory.apiValue,
    'composer_mode': composerMode.apiValue,
    'composer_config': composerConfig.toJson(),
    if (startDate != null && startDate!.trim().isNotEmpty)
      'start_date': startDate,
    'is_active': isActive,
  };

  @override
  List<Object?> get props => [
    name,
    description,
    color,
    icon,
    trackingMode,
    targetPeriod,
    targetOperator,
    targetValue,
    primaryMetricKey,
    aggregationStrategy,
    inputSchema,
    quickAddValues,
    freezeAllowance,
    recoveryWindowPeriods,
    useCase,
    templateCategory,
    composerMode,
    composerConfig,
    startDate,
    isActive,
  ];
}

class HabitTrackerEntryInput extends Equatable {
  const HabitTrackerEntryInput({
    required this.entryDate,
    required this.values,
    this.entryKind,
    this.occurredAt,
    this.primaryValue,
    this.note,
    this.tags = const [],
    this.userId,
  });

  final HabitTrackerEntryKind? entryKind;
  final String entryDate;
  final DateTime? occurredAt;
  final Map<String, Object?> values;
  final double? primaryValue;
  final String? note;
  final List<String> tags;
  final String? userId;

  Map<String, dynamic> toJson() => {
    if (entryKind != null) 'entry_kind': entryKind!.apiValue,
    'entry_date': entryDate,
    if (occurredAt != null)
      'occurred_at': occurredAt!.toUtc().toIso8601String(),
    'values': values.map((key, value) {
      if (value is List<HabitTrackerExerciseBlock>) {
        return MapEntry(
          key,
          value.map((block) => block.toJson()).toList(growable: false),
        );
      }
      return MapEntry(key, value);
    }),
    if (primaryValue != null) 'primary_value': primaryValue,
    if (note != null && note!.trim().isNotEmpty) 'note': note!.trim(),
    if (tags.isNotEmpty) 'tags': tags,
    if (userId != null && userId!.trim().isNotEmpty) 'user_id': userId!.trim(),
  };

  int get valuesHash => Object.hashAllUnordered(
    values.entries.map((entry) => Object.hash(entry.key, entry.value)),
  );

  @override
  List<Object?> get props => [
    entryKind,
    entryDate,
    occurredAt,
    valuesHash,
    primaryValue,
    note,
    tags,
    userId,
  ];
}

class HabitTrackerStreakActionInput extends Equatable {
  const HabitTrackerStreakActionInput({
    required this.actionType,
    required this.periodStart,
    this.note,
    this.userId,
  });

  final HabitTrackerStreakActionType actionType;
  final String periodStart;
  final String? note;
  final String? userId;

  Map<String, dynamic> toJson() => {
    'action_type': actionType.apiValue,
    'period_start': periodStart,
    if (note != null && note!.trim().isNotEmpty) 'note': note!.trim(),
    if (userId != null && userId!.trim().isNotEmpty) 'user_id': userId!.trim(),
  };

  @override
  List<Object?> get props => [actionType, periodStart, note, userId];
}

class HabitTrackerTemplate extends Equatable {
  const HabitTrackerTemplate({
    required this.id,
    required this.name,
    required this.description,
    required this.color,
    required this.icon,
    required this.trackingMode,
    required this.targetPeriod,
    required this.targetOperator,
    required this.targetValue,
    required this.primaryMetricKey,
    required this.aggregationStrategy,
    required this.quickAddValues,
    required this.inputSchema,
    required this.freezeAllowance,
    required this.recoveryWindowPeriods,
    this.useCase = HabitTrackerUseCase.generic,
    this.templateCategory = HabitTrackerTemplateCategory.custom,
    this.composerMode = HabitTrackerComposerMode.advancedCustom,
    this.composerConfig = const HabitTrackerComposerConfig(),
  });

  final String id;
  final String name;
  final String description;
  final String color;
  final String icon;
  final HabitTrackerTrackingMode trackingMode;
  final HabitTrackerTargetPeriod targetPeriod;
  final HabitTrackerTargetOperator targetOperator;
  final double targetValue;
  final String primaryMetricKey;
  final HabitTrackerAggregationStrategy aggregationStrategy;
  final List<double> quickAddValues;
  final List<HabitTrackerFieldSchema> inputSchema;
  final int freezeAllowance;
  final int recoveryWindowPeriods;
  final HabitTrackerUseCase useCase;
  final HabitTrackerTemplateCategory templateCategory;
  final HabitTrackerComposerMode composerMode;
  final HabitTrackerComposerConfig composerConfig;

  HabitTrackerInput toInput({String? startDate}) {
    return HabitTrackerInput(
      name: name,
      description: description,
      color: color,
      icon: icon,
      trackingMode: trackingMode,
      targetPeriod: targetPeriod,
      targetOperator: targetOperator,
      targetValue: targetValue,
      primaryMetricKey: primaryMetricKey,
      aggregationStrategy: aggregationStrategy,
      inputSchema: inputSchema,
      quickAddValues: quickAddValues,
      freezeAllowance: freezeAllowance,
      recoveryWindowPeriods: recoveryWindowPeriods,
      useCase: useCase,
      templateCategory: templateCategory,
      composerMode: composerMode,
      composerConfig: composerConfig,
      startDate: startDate,
    );
  }

  @override
  List<Object?> get props => [
    id,
    name,
    description,
    color,
    icon,
    trackingMode,
    targetPeriod,
    targetOperator,
    targetValue,
    primaryMetricKey,
    aggregationStrategy,
    quickAddValues,
    inputSchema,
    freezeAllowance,
    recoveryWindowPeriods,
    useCase,
    templateCategory,
    composerMode,
    composerConfig,
  ];
}
