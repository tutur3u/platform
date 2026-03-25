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
  start_date: z.string().date().optional(),
  is_active: z.boolean().optional(),
});

export const habitTrackerUpdateSchema = habitTrackerInputSchema.partial();

export const habitTrackerEntryInputSchema = z.object({
  entry_kind: z.enum(HabitTrackerEntryKinds).optional(),
  entry_date: z.string().date(),
  occurred_at: z.string().datetime().optional(),
  values: z.record(
    z.string(),
    z.union([z.boolean(), z.number(), z.string(), z.null()])
  ),
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
