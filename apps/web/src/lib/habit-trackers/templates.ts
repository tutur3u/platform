import type {
  HabitTrackerComposerConfig,
  HabitTrackerTemplate,
  HabitTrackerTemplateCategory,
} from '@tuturuuu/types/primitives/HabitTracker';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';

export const HABIT_TRACKER_COLOR_CLASS_MAP: Record<
  SupportedColor,
  {
    badge: string;
    border: string;
    text: string;
  }
> = {
  BLUE: {
    badge: 'bg-dynamic-blue/10',
    border: 'border-dynamic-blue/20',
    text: 'text-dynamic-blue',
  },
  CYAN: {
    badge: 'bg-dynamic-cyan/10',
    border: 'border-dynamic-cyan/20',
    text: 'text-dynamic-cyan',
  },
  GRAY: {
    badge: 'bg-dynamic-gray/10',
    border: 'border-dynamic-gray/20',
    text: 'text-dynamic-gray',
  },
  GREEN: {
    badge: 'bg-dynamic-green/10',
    border: 'border-dynamic-green/20',
    text: 'text-dynamic-green',
  },
  INDIGO: {
    badge: 'bg-dynamic-indigo/10',
    border: 'border-dynamic-indigo/20',
    text: 'text-dynamic-indigo',
  },
  ORANGE: {
    badge: 'bg-dynamic-orange/10',
    border: 'border-dynamic-orange/20',
    text: 'text-dynamic-orange',
  },
  PINK: {
    badge: 'bg-dynamic-pink/10',
    border: 'border-dynamic-pink/20',
    text: 'text-dynamic-pink',
  },
  PURPLE: {
    badge: 'bg-dynamic-purple/10',
    border: 'border-dynamic-purple/20',
    text: 'text-dynamic-purple',
  },
  RED: {
    badge: 'bg-dynamic-red/10',
    border: 'border-dynamic-red/20',
    text: 'text-dynamic-red',
  },
  YELLOW: {
    badge: 'bg-dynamic-yellow/10',
    border: 'border-dynamic-yellow/20',
    text: 'text-dynamic-yellow',
  },
};

function numberField(
  key: string,
  label: string,
  options: { unit?: string; required?: boolean } = {}
) {
  return {
    key,
    label,
    type: 'number' as const,
    unit: options.unit,
    required: options.required,
  };
}

function textField(key: string, label: string) {
  return {
    key,
    label,
    type: 'text' as const,
  };
}

function booleanField(key: string, label: string) {
  return {
    key,
    label,
    type: 'boolean' as const,
    required: true,
  };
}

function quickIncrementTemplate(options: {
  id: string;
  name: string;
  description: string;
  color: SupportedColor;
  icon: string;
  targetValue: number;
  key: string;
  unit?: string;
  quickAddValues: number[];
  trackingMode?: 'event_log' | 'daily_summary';
}): HabitTrackerTemplate {
  const trackingMode = options.trackingMode ?? 'event_log';

  return {
    id: options.id,
    name: options.name,
    description: options.description,
    color: options.color,
    icon: options.icon,
    tracking_mode: trackingMode,
    target_period: 'daily',
    target_operator: 'gte',
    target_value: options.targetValue,
    primary_metric_key: options.key,
    aggregation_strategy: trackingMode === 'daily_summary' ? 'max' : 'sum',
    quick_add_values: options.quickAddValues,
    input_schema: [
      {
        key: options.key,
        label: options.name,
        type: 'number',
        unit: options.unit,
        required: true,
      },
    ],
    freeze_allowance: 1,
    recovery_window_periods: 1,
    use_case: 'counter',
    template_category: 'health',
    composer_mode: 'quick_increment',
    composer_config: {
      unit: options.unit ?? null,
      suggested_increments: options.quickAddValues,
      progress_variant: 'ring',
    },
  };
}

function wellnessCheckTemplate(options: {
  id: string;
  name: string;
  description: string;
  color: SupportedColor;
  icon: string;
  targetPeriod?: 'daily' | 'weekly';
  targetValue?: number;
  aggregationStrategy?: 'boolean_any' | 'count_entries';
}): HabitTrackerTemplate {
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    color: options.color,
    icon: options.icon,
    tracking_mode: 'event_log',
    target_period: options.targetPeriod ?? 'daily',
    target_operator: 'gte',
    target_value: options.targetValue ?? 1,
    primary_metric_key: 'done',
    aggregation_strategy: options.aggregationStrategy ?? 'boolean_any',
    quick_add_values: [],
    input_schema: [booleanField('done', 'Done')],
    freeze_allowance: 2,
    recovery_window_periods: 1,
    use_case: 'wellness_check',
    template_category: 'recovery',
    composer_mode: 'quick_check',
    composer_config: {
      progress_variant: 'check',
    },
  };
}

function measurementTemplate(options: {
  id: string;
  name: string;
  description: string;
  color: SupportedColor;
  icon: string;
  targetValue: number;
  key: string;
  unit: string;
  supportedUnits?: string[];
  category?: HabitTrackerTemplateCategory;
}): HabitTrackerTemplate {
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    color: options.color,
    icon: options.icon,
    tracking_mode: 'daily_summary',
    target_period: 'daily',
    target_operator: 'gte',
    target_value: options.targetValue,
    primary_metric_key: options.key,
    aggregation_strategy: 'max',
    quick_add_values: [],
    input_schema: [
      {
        key: options.key,
        label: options.name,
        type: 'number',
        unit: options.unit,
        required: true,
      },
      textField('note', 'Note'),
    ],
    freeze_allowance: 1,
    recovery_window_periods: 1,
    use_case: options.id === 'body_weight' ? 'body_weight' : 'measurement',
    template_category: options.category ?? 'health',
    composer_mode: 'measurement',
    composer_config: {
      unit: options.unit,
      supported_units: options.supportedUnits ?? [],
      progress_variant: 'ring',
    },
  };
}

function workoutTemplate(options: {
  id: string;
  name: string;
  description: string;
  color: SupportedColor;
  targetValue: number;
  suggestedExercises: string[];
  defaultSets?: number;
  defaultReps?: number;
}): HabitTrackerTemplate {
  const composerConfig: HabitTrackerComposerConfig = {
    supported_units: ['kg', 'lb'],
    suggested_exercises: options.suggestedExercises,
    default_sets: options.defaultSets ?? 4,
    default_reps: options.defaultReps ?? 8,
    default_weight_unit: 'kg',
    progress_variant: 'ring',
  };

  return {
    id: options.id,
    name: options.name,
    description: options.description,
    color: options.color,
    icon: 'Dumbbell',
    tracking_mode: 'event_log',
    target_period: 'weekly',
    target_operator: 'gte',
    target_value: options.targetValue,
    primary_metric_key: 'session_count',
    aggregation_strategy: 'count_entries',
    quick_add_values: [],
    input_schema: [
      numberField('session_count', 'Session'),
      numberField('total_sets', 'Total sets'),
      numberField('total_reps', 'Total reps'),
      numberField('total_volume', 'Total volume', { unit: 'kg' }),
    ],
    freeze_allowance: 1,
    recovery_window_periods: 1,
    use_case: 'workout_session',
    template_category: 'strength',
    composer_mode: 'workout_session',
    composer_config: composerConfig,
  };
}

export const HABIT_TRACKER_TEMPLATES: HabitTrackerTemplate[] = [
  measurementTemplate({
    id: 'body_weight',
    name: 'Body Weight',
    description:
      'Log body weight with per-tracker units and a clean daily check-in.',
    color: 'INDIGO',
    icon: 'SlidersHorizontal',
    targetValue: 70,
    key: 'weight',
    unit: 'kg',
    supportedUnits: ['kg', 'lb'],
  }),
  workoutTemplate({
    id: 'workout_session',
    name: 'Workout Session',
    description:
      'Capture a full workout with multiple exercise blocks, sets, reps, and weight.',
    color: 'RED',
    targetValue: 3,
    suggestedExercises: ['Bench Press', 'Squat', 'Deadlift', 'Row'],
  }),
  workoutTemplate({
    id: 'strength_lift',
    name: 'Strength Lift',
    description:
      'Track a focused strength session with structured blocks for your main lifts.',
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
  }),
  quickIncrementTemplate({
    id: 'push_ups',
    name: 'Push-Ups',
    description: 'Add reps fast and keep a visible daily target in reach.',
    color: 'GREEN',
    icon: 'Flame',
    targetValue: 100,
    key: 'count',
    quickAddValues: [10, 25, 50],
  }),
  quickIncrementTemplate({
    id: 'pull_ups',
    name: 'Pull-Ups',
    description: 'Log small rep bursts quickly without leaving the Today list.',
    color: 'CYAN',
    icon: 'ShieldPlus',
    targetValue: 20,
    key: 'count',
    quickAddValues: [3, 5, 10],
  }),
  quickIncrementTemplate({
    id: 'steps',
    name: 'Steps',
    description: 'Track movement volume as a clean rolling daily total.',
    color: 'GREEN',
    icon: 'Footprints',
    targetValue: 6000,
    key: 'steps',
    quickAddValues: [1000, 2000, 3000],
    trackingMode: 'daily_summary',
  }),
  quickIncrementTemplate({
    id: 'water',
    name: 'Water',
    description:
      'Track hydration with quick chips that feel instant on the Today surface.',
    color: 'CYAN',
    icon: 'Droplets',
    targetValue: 8,
    key: 'glasses',
    unit: 'glass',
    quickAddValues: [1, 2, 3],
  }),
  measurementTemplate({
    id: 'sleep',
    name: 'Sleep',
    description:
      'Record hours slept with a large numeric composer and gentle daily review.',
    color: 'PURPLE',
    icon: 'Snowflake',
    targetValue: 8,
    key: 'hours',
    unit: 'hours',
    category: 'recovery',
  }),
  wellnessCheckTemplate({
    id: 'stretching',
    name: 'Stretching',
    description: 'Mark daily mobility work complete in one tap.',
    color: 'YELLOW',
    icon: 'Footprints',
  }),
  wellnessCheckTemplate({
    id: 'meditation',
    name: 'Meditation',
    description: 'Keep a calm daily ritual visible with a one-tap check-in.',
    color: 'INDIGO',
    icon: 'ShieldPlus',
  }),
  wellnessCheckTemplate({
    id: 'sauna',
    name: 'Sauna',
    description: 'Track recovery sessions against a weekly target.',
    color: 'ORANGE',
    icon: 'Flame',
    targetPeriod: 'weekly',
    targetValue: 3,
    aggregationStrategy: 'count_entries',
  }),
  wellnessCheckTemplate({
    id: 'medication',
    name: 'Medication',
    description: 'Confirm medication adherence in a fast daily flow.',
    color: 'BLUE',
    icon: 'ShieldPlus',
  }),
  wellnessCheckTemplate({
    id: 'no_social_media',
    name: 'No Social Media',
    description: 'Use a simple daily check when you held the line.',
    color: 'GRAY',
    icon: 'Repeat',
  }),
  {
    id: 'custom',
    name: 'Custom',
    description: 'Build a tracker for any repeated metric or ritual.',
    color: 'BLUE',
    icon: 'SlidersHorizontal',
    tracking_mode: 'event_log',
    target_period: 'daily',
    target_operator: 'gte',
    target_value: 1,
    primary_metric_key: 'value',
    aggregation_strategy: 'sum',
    quick_add_values: [1],
    input_schema: [
      {
        key: 'value',
        label: 'Value',
        type: 'number',
        required: true,
      },
      textField('note', 'Note'),
    ],
    freeze_allowance: 2,
    recovery_window_periods: 1,
    use_case: 'generic',
    template_category: 'custom',
    composer_mode: 'advanced_custom',
    composer_config: {
      progress_variant: 'bar',
    },
  },
];

export function getHabitTrackerTemplate(templateId: string) {
  return HABIT_TRACKER_TEMPLATES.find((template) => template.id === templateId);
}

export function getHabitTrackerTemplatesByCategory(
  category: HabitTrackerTemplateCategory
) {
  return HABIT_TRACKER_TEMPLATES.filter(
    (template) => template.template_category === category
  );
}
