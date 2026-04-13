import {
  HabitTrackerAggregationStrategies,
  HabitTrackerEntryKinds,
  HabitTrackerFieldTypes,
  HabitTrackerStreakActionTypes,
  HabitTrackerTargetOperators,
  HabitTrackerTargetPeriods,
  HabitTrackerTrackingModes,
} from '@tuturuuu/types/primitives/HabitTracker';
import { SUPPORTED_COLORS } from '@tuturuuu/types/primitives/SupportedColors';
import { z } from 'zod';

const habitTrackerUseCases = [
  'generic',
  'body_weight',
  'counter',
  'measurement',
  'workout_session',
  'wellness_check',
] as const;

const habitTrackerTemplateCategories = [
  'strength',
  'health',
  'recovery',
  'discipline',
  'custom',
] as const;

const habitTrackerComposerModes = [
  'quick_check',
  'quick_increment',
  'measurement',
  'workout_session',
  'advanced_custom',
] as const;

const habitTrackerProgressVariants = ['ring', 'bar', 'check'] as const;

export const habitTrackerFieldSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9_]+$/),
  label: z.string().trim().min(1),
  type: z.enum(HabitTrackerFieldTypes),
  unit: z.string().trim().nullish(),
  required: z.boolean().optional(),
  options: z
    .array(
      z.object({
        label: z.string().trim().min(1),
        value: z.string().trim().min(1),
      })
    )
    .optional(),
});

export const habitTrackerComposerConfigSchema = z.object({
  unit: z.string().trim().nullish(),
  supported_units: z.array(z.string().trim().min(1)).max(6).optional(),
  suggested_increments: z.array(z.number()).max(8).optional(),
  progress_variant: z.enum(habitTrackerProgressVariants).optional(),
  suggested_exercises: z.array(z.string().trim().min(1)).max(12).optional(),
  default_sets: z.number().int().min(1).max(20).nullish(),
  default_reps: z.number().int().min(1).max(200).nullish(),
  default_weight_unit: z.string().trim().nullish(),
});

export const habitTrackerInputSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().max(400).nullish(),
  color: z.enum(SUPPORTED_COLORS),
  icon: z.string().trim().min(1),
  tracking_mode: z.enum(HabitTrackerTrackingModes),
  target_period: z.enum(HabitTrackerTargetPeriods),
  target_operator: z.enum(HabitTrackerTargetOperators),
  target_value: z.number().positive(),
  primary_metric_key: z.string().trim().min(1),
  aggregation_strategy: z.enum(HabitTrackerAggregationStrategies),
  input_schema: z.array(habitTrackerFieldSchema).min(1).max(4),
  quick_add_values: z.array(z.number()).max(6).optional(),
  freeze_allowance: z.number().int().min(0).max(10).optional(),
  recovery_window_periods: z.number().int().min(0).max(6).optional(),
  use_case: z.enum(habitTrackerUseCases).default('generic'),
  template_category: z.enum(habitTrackerTemplateCategories).default('custom'),
  composer_mode: z.enum(habitTrackerComposerModes).default('advanced_custom'),
  composer_config: habitTrackerComposerConfigSchema.default({}),
  start_date: z.string().date().optional(),
  is_active: z.boolean().optional(),
});

export const habitTrackerUpdateSchema = habitTrackerInputSchema.partial();

export const habitTrackerExerciseBlockSchema = z.object({
  exercise_name: z.string().trim().min(1).max(120),
  sets: z.number().int().min(1).max(50),
  reps: z.number().int().min(1).max(500),
  weight: z.number().min(0).max(100000).nullish(),
  unit: z.string().trim().max(20).nullish(),
  notes: z.string().trim().max(200).nullish(),
});

const habitTrackerEntryValueSchema: z.ZodTypeAny = z.union([
  z.boolean(),
  z.number(),
  z.string(),
  z.null(),
  z.array(habitTrackerExerciseBlockSchema),
]);

export const habitTrackerEntryInputSchema = z.object({
  entry_kind: z.enum(HabitTrackerEntryKinds).optional(),
  entry_date: z.string().date(),
  occurred_at: z.string().datetime().optional(),
  values: z.record(z.string(), habitTrackerEntryValueSchema),
  primary_value: z.number().nullable().optional(),
  note: z.string().trim().max(500).nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
});

export const habitTrackerEntryUpdateSchema =
  habitTrackerEntryInputSchema.partial();

export const habitTrackerStreakActionInputSchema = z.object({
  action_type: z.enum(HabitTrackerStreakActionTypes),
  period_start: z.string().date(),
  note: z.string().trim().max(300).nullish(),
});

export const habitTrackerListQuerySchema = z.object({
  scope: z.enum(['self', 'team', 'member']).optional(),
  userId: z.string().uuid().optional(),
});
