import { z } from 'zod';

const dateOnlyStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD format');

const flexibleDateTimeStringSchema = z
  .string()
  .trim()
  .regex(
    /^(?:\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-][01]\d:[0-5]\d)?|\d{4}-\d{2}-\d{2}\s+(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?|(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)$/,
    'must be a valid ISO datetime, YYYY-MM-DD HH:mm, or HH:mm/HH:mm:ss'
  );

const temporalDateTimeInputSchema = z.union([
  z.date(),
  flexibleDateTimeStringSchema,
]);
const temporalDateInputSchema = z.union([z.date(), dateOnlyStringSchema]);

export const startTimerArgsSchema = z.object({
  title: z.string().trim().min(1, 'title is required'),
  description: z.union([z.string(), z.null()]).optional(),
});

export type StartTimerArgs = z.infer<typeof startTimerArgsSchema>;

export const stopTimerArgsSchema = z.object({
  sessionId: z.union([z.string(), z.null()]).optional(),
});

export type StopTimerArgs = z.infer<typeof stopTimerArgsSchema>;

export const createTimeTrackingEntryArgsSchema = z.object({
  title: z.string().trim().min(1, 'title is required'),
  description: z.union([z.string(), z.null()]).optional(),
  categoryId: z.union([z.string(), z.null()]).optional(),
  taskId: z.union([z.string(), z.null()]).optional(),
  startTime: temporalDateTimeInputSchema,
  endTime: temporalDateTimeInputSchema,
  date: temporalDateInputSchema.optional(),
});

export type CreateTimeTrackingEntryArgs = z.infer<
  typeof createTimeTrackingEntryArgsSchema
>;

export const updateTimeTrackingSessionArgsSchema = z.object({
  sessionId: z.union([z.string(), z.null()]).optional(),
  id: z.union([z.string(), z.null()]).optional(),
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  categoryId: z.union([z.string(), z.null()]).optional(),
  taskId: z.union([z.string(), z.null()]).optional(),
  startTime: temporalDateTimeInputSchema.optional(),
  endTime: temporalDateTimeInputSchema.optional(),
  date: temporalDateInputSchema.optional(),
});

export type UpdateTimeTrackingSessionArgs = z.infer<
  typeof updateTimeTrackingSessionArgsSchema
>;

export const deleteTimeTrackingSessionArgsSchema = z.object({
  sessionId: z.union([z.string(), z.null()]).optional(),
  id: z.union([z.string(), z.null()]).optional(),
});

export type DeleteTimeTrackingSessionArgs = z.infer<
  typeof deleteTimeTrackingSessionArgsSchema
>;

export const moveTimeTrackingSessionArgsSchema = z.object({
  sessionId: z.union([z.string(), z.null()]).optional(),
  id: z.union([z.string(), z.null()]).optional(),
  targetWorkspaceId: z.string().trim().min(1, 'targetWorkspaceId is required'),
});

export type MoveTimeTrackingSessionArgs = z.infer<
  typeof moveTimeTrackingSessionArgsSchema
>;

export const createTimeTrackerGoalArgsSchema = z.object({
  categoryId: z.union([z.string(), z.null()]).optional(),
  dailyGoalMinutes: z
    .number()
    .int()
    .min(1, 'dailyGoalMinutes must be greater than 0'),
  weeklyGoalMinutes: z.union([z.number().int().min(1), z.null()]).optional(),
  isActive: z.boolean().optional(),
});

export type CreateTimeTrackerGoalArgs = z.infer<
  typeof createTimeTrackerGoalArgsSchema
>;

export const updateTimeTrackerGoalArgsSchema = z.object({
  goalId: z.union([z.string(), z.null()]).optional(),
  id: z.union([z.string(), z.null()]).optional(),
  categoryId: z.union([z.string(), z.null()]).optional(),
  dailyGoalMinutes: z
    .number()
    .int()
    .min(1, 'dailyGoalMinutes must be greater than 0')
    .optional(),
  weeklyGoalMinutes: z.union([z.number().int().min(1), z.null()]).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateTimeTrackerGoalArgs = z.infer<
  typeof updateTimeTrackerGoalArgsSchema
>;

export const deleteTimeTrackerGoalArgsSchema = z.object({
  goalId: z.union([z.string(), z.null()]).optional(),
  id: z.union([z.string(), z.null()]).optional(),
});

export type DeleteTimeTrackerGoalArgs = z.infer<
  typeof deleteTimeTrackerGoalArgsSchema
>;

export const createTimeTrackingCategoryArgsSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  description: z.union([z.string(), z.null()]).optional(),
  color: z.union([z.string(), z.null()]).optional(),
});

export type CreateTimeTrackingCategoryArgs = z.infer<
  typeof createTimeTrackingCategoryArgsSchema
>;

export const updateTimeTrackingCategoryArgsSchema = z.object({
  categoryId: z.union([z.string(), z.null()]).optional(),
  id: z.union([z.string(), z.null()]).optional(),
  name: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  color: z.union([z.string(), z.null()]).optional(),
});

export type UpdateTimeTrackingCategoryArgs = z.infer<
  typeof updateTimeTrackingCategoryArgsSchema
>;

export const deleteTimeTrackingCategoryArgsSchema = z.object({
  categoryId: z.union([z.string(), z.null()]).optional(),
  id: z.union([z.string(), z.null()]).optional(),
});

export type DeleteTimeTrackingCategoryArgs = z.infer<
  typeof deleteTimeTrackingCategoryArgsSchema
>;

export function getZodErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? 'Invalid arguments';
  }
  return 'Invalid arguments';
}
