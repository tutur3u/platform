import { z } from 'zod';

export const taskProgressMetricKindSchema = z.enum([
  'tasks',
  'points',
  'minutes',
  'focus_sessions',
  'words',
  'pages',
  'chapters',
  'scenes',
  'lines',
  'custom',
]);
export const taskProgressAggregationSchema = z.enum(['sum', 'latest_total']);
export const taskProgressEntryModeSchema = z.enum(['delta', 'total']);
export const taskProgressSourceTypeSchema = z.enum([
  'manual',
  'import',
  'task_completion',
  'time_tracking',
  'api',
]);
export const taskProgressGoalTypeSchema = z.enum(['target', 'habit']);
export const taskProgressRecurrenceSchema = z.enum([
  'none',
  'daily',
  'weekly',
  'monthly',
]);
export const taskProgressGoalStatusSchema = z.enum([
  'active',
  'paused',
  'completed',
  'archived',
]);
export const taskLeaderboardStatusSchema = z.enum(['active', 'archived']);
export const taskProgressVisibilitySchema = z.enum(['private', 'workspace']);

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Expected YYYY-MM-DD');

export const tagListSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .default([])
  .transform((tags) => Array.from(new Set(tags)));

export const metricCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  unit_label: z.string().trim().min(1).max(40),
  unit_kind: taskProgressMetricKindSchema.default('custom'),
  description: z.string().trim().max(1000).nullable().optional(),
  aggregation: taskProgressAggregationSchema.default('sum'),
  is_default: z.boolean().default(false),
});

export const metricUpdateSchema = metricCreateSchema.partial();

export const entryCreateSchema = z.object({
  metric_id: z.guid(),
  task_id: z.guid().nullable().optional(),
  project_id: z.guid().nullable().optional(),
  board_id: z.guid().nullable().optional(),
  list_id: z.guid().nullable().optional(),
  entry_date: dateStringSchema.optional(),
  value: z.number().finite(),
  mode: taskProgressEntryModeSchema.default('delta'),
  note: z.string().max(5000).nullable().optional(),
  tags: tagListSchema,
  source_type: taskProgressSourceTypeSchema.default('manual'),
  source_id: z.string().trim().max(200).nullable().optional(),
});

export const entryUpdateSchema = entryCreateSchema.partial();

export const goalCreateSchema = z.object({
  metric_id: z.guid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  goal_type: taskProgressGoalTypeSchema.default('target'),
  target_value: z.number().finite().positive(),
  period_start: dateStringSchema,
  period_end: dateStringSchema.nullable().optional(),
  recurrence: taskProgressRecurrenceSchema.default('none'),
  task_id: z.guid().nullable().optional(),
  project_id: z.guid().nullable().optional(),
  board_id: z.guid().nullable().optional(),
  tags: tagListSchema,
  status: taskProgressGoalStatusSchema.default('active'),
  starred: z.boolean().default(false),
  visibility: taskProgressVisibilitySchema.default('private'),
  // Habit-goal configuration (ignored for target goals).
  habit_frequency: z
    .enum(['per_day', 'per_week', 'per_month'])
    .nullable()
    .optional(),
  habit_target_count: z.number().int().positive().nullable().optional(),
  habit_threshold: z.number().finite().nonnegative().nullable().optional(),
});

export const goalUpdateSchema = goalCreateSchema.partial();

export const leaderboardCreateSchema = z.object({
  metric_id: z.guid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  period_start: dateStringSchema,
  period_end: dateStringSchema.nullable().optional(),
  status: taskLeaderboardStatusSchema.default('active'),
  starred: z.boolean().default(false),
});

export const leaderboardUpdateSchema = leaderboardCreateSchema.partial();

export const leaderboardTeamCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().trim().max(40).nullable().optional(),
});

export const leaderboardMemberCreateSchema = z.object({
  user_id: z.guid().nullable().optional(),
  team_id: z.guid().nullable().optional(),
  display_name: z.string().trim().max(120).nullable().optional(),
});

export const progressImportSchema = z.object({
  commit: z.boolean().default(false),
  entries: z.array(entryCreateSchema).min(1).max(500),
});

export const TASK_PROGRESS_METRIC_SELECT = `
  id,
  ws_id,
  name,
  unit_label,
  unit_kind,
  description,
  aggregation,
  is_default,
  created_by,
  created_at,
  updated_at,
  archived_at
`;

export const TASK_PROGRESS_ENTRY_SELECT = `
  id,
  ws_id,
  metric_id,
  task_id,
  project_id,
  board_id,
  list_id,
  entry_date,
  value,
  mode,
  note,
  tags,
  source_type,
  source_id,
  created_by,
  created_at,
  updated_at,
  deleted_at
`;

export const TASK_PROGRESS_GOAL_SELECT = `
  id,
  ws_id,
  owner_id,
  metric_id,
  name,
  description,
  goal_type,
  target_value,
  period_start,
  period_end,
  recurrence,
  task_id,
  project_id,
  board_id,
  tags,
  status,
  starred,
  visibility,
  created_at,
  updated_at,
  archived_at
`;

export const TASK_LEADERBOARD_SELECT = `
  id,
  ws_id,
  metric_id,
  name,
  description,
  period_start,
  period_end,
  join_code,
  status,
  starred,
  visibility,
  created_by,
  created_at,
  updated_at,
  archived_at
`;

export const DEFAULT_TASK_PROGRESS_METRICS = [
  {
    name: 'Completed tasks',
    unit_label: 'tasks',
    unit_kind: 'tasks',
    description: 'Completed task count',
    is_default: true,
  },
  {
    name: 'Estimate points',
    unit_label: 'points',
    unit_kind: 'points',
    description: 'Completed or logged estimation points',
    is_default: false,
  },
  {
    name: 'Focus time',
    unit_label: 'minutes',
    unit_kind: 'minutes',
    description: 'Minutes spent on focused task work',
    is_default: false,
  },
  {
    name: 'Focus sessions',
    unit_label: 'sessions',
    unit_kind: 'focus_sessions',
    description: 'Completed focus sessions',
    is_default: false,
  },
] as const;
