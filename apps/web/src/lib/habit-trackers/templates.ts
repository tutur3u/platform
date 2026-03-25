import type { HabitTrackerTemplate } from '@tuturuuu/types/primitives/HabitTracker';
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

export const HABIT_TRACKER_TEMPLATES: HabitTrackerTemplate[] = [
  {
    id: 'water',
    name: 'Water',
    description: 'Track daily hydration with quick-add amounts.',
    color: 'CYAN',
    icon: 'Droplets',
    tracking_mode: 'event_log',
    target_period: 'daily',
    target_operator: 'gte',
    target_value: 8,
    primary_metric_key: 'glasses',
    aggregation_strategy: 'sum',
    quick_add_values: [1, 2, 3],
    freeze_allowance: 2,
    recovery_window_periods: 1,
    input_schema: [
      {
        key: 'glasses',
        label: 'Glasses',
        type: 'number',
        unit: 'glass',
        required: true,
      },
      {
        key: 'note',
        label: 'Context',
        type: 'text',
      },
    ],
  },
  {
    id: 'gym',
    name: 'Gym',
    description: 'Log sets, reps, and weight for each workout block.',
    color: 'RED',
    icon: 'Dumbbell',
    tracking_mode: 'event_log',
    target_period: 'weekly',
    target_operator: 'gte',
    target_value: 4,
    primary_metric_key: 'sets',
    aggregation_strategy: 'sum',
    quick_add_values: [3, 4, 5],
    freeze_allowance: 1,
    recovery_window_periods: 1,
    input_schema: [
      {
        key: 'sets',
        label: 'Sets',
        type: 'number',
        required: true,
      },
      {
        key: 'reps',
        label: 'Reps',
        type: 'number',
      },
      {
        key: 'weight',
        label: 'Weight',
        type: 'number',
        unit: 'kg',
      },
      {
        key: 'focus',
        label: 'Focus',
        type: 'text',
      },
    ],
  },
  {
    id: 'reading',
    name: 'Reading',
    description: 'Track pages or chapters finished and capture reflections.',
    color: 'PURPLE',
    icon: 'BookOpen',
    tracking_mode: 'daily_summary',
    target_period: 'daily',
    target_operator: 'gte',
    target_value: 20,
    primary_metric_key: 'pages',
    aggregation_strategy: 'sum',
    quick_add_values: [10, 20, 30],
    freeze_allowance: 2,
    recovery_window_periods: 1,
    input_schema: [
      {
        key: 'pages',
        label: 'Pages',
        type: 'number',
        unit: 'page',
        required: true,
      },
      {
        key: 'book',
        label: 'Book',
        type: 'text',
      },
    ],
  },
  {
    id: 'leetcode',
    name: 'LeetCode',
    description: 'Log solved problems and difficulty for deliberate practice.',
    color: 'ORANGE',
    icon: 'Code2',
    tracking_mode: 'event_log',
    target_period: 'daily',
    target_operator: 'gte',
    target_value: 1,
    primary_metric_key: 'problems',
    aggregation_strategy: 'sum',
    quick_add_values: [1, 2, 3],
    freeze_allowance: 3,
    recovery_window_periods: 2,
    input_schema: [
      {
        key: 'problems',
        label: 'Problems',
        type: 'number',
        required: true,
      },
      {
        key: 'difficulty',
        label: 'Difficulty',
        type: 'select',
        required: true,
        options: [
          { label: 'Easy', value: 'easy' },
          { label: 'Medium', value: 'medium' },
          { label: 'Hard', value: 'hard' },
        ],
      },
      {
        key: 'topic',
        label: 'Topic',
        type: 'text',
      },
    ],
  },
  {
    id: 'steps',
    name: 'Steps',
    description: 'Track movement volume as a single daily number.',
    color: 'GREEN',
    icon: 'Footprints',
    tracking_mode: 'daily_summary',
    target_period: 'daily',
    target_operator: 'gte',
    target_value: 10000,
    primary_metric_key: 'steps',
    aggregation_strategy: 'max',
    quick_add_values: [2000, 5000, 10000],
    freeze_allowance: 1,
    recovery_window_periods: 1,
    input_schema: [
      {
        key: 'steps',
        label: 'Steps',
        type: 'number',
        required: true,
      },
    ],
  },
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
    freeze_allowance: 2,
    recovery_window_periods: 1,
    input_schema: [
      {
        key: 'value',
        label: 'Value',
        type: 'number',
        required: true,
      },
      {
        key: 'note',
        label: 'Note',
        type: 'text',
      },
    ],
  },
];

export function getHabitTrackerTemplate(templateId: string) {
  return HABIT_TRACKER_TEMPLATES.find((template) => template.id === templateId);
}
