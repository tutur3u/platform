import {
  TaskRecurrenceScheduleSchema,
  validateTaskRecurrence,
} from '@tuturuuu/utils/task-recurrence';
import { z } from 'zod';

const uuid = z.uuid();
const ids = z
  .array(uuid)
  .max(50)
  .refine((values) => new Set(values).size === values.length)
  .transform((values) => values.toSorted());

const template = z.strictObject({
  title: z.string().trim().min(1).max(255),
  description: z.string().max(16_000).nullable(),
  priority: z.enum(['critical', 'high', 'normal', 'low']).nullable(),
  estimate: z.number().int().min(0).max(32767).nullable(),
  labels: ids,
  projects: ids,
  assignees: ids,
});

const spec = z.strictObject({
  schedule: TaskRecurrenceScheduleSchema.refine((value) => {
    try {
      validateTaskRecurrence(value);
      return true;
    } catch {
      return false;
    }
  }),
  template,
});

const receipt = z.string().min(1).max(250);
const seriesVersion = {
  seriesId: uuid,
  taskId: uuid,
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  progress: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  receipt,
};

export const recurrenceRequest = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('prepare'), listId: uuid }),
  z.strictObject({ operation: z.literal('prepareTask'), taskId: uuid }),
  z.strictObject({
    operation: z.literal('create'),
    listId: uuid,
    receipt,
    spec,
  }),
  z.strictObject({
    operation: z.literal('edit'),
    ...seriesVersion,
    spec,
  }),
  z.strictObject({
    operation: z.literal('status'),
    ...seriesVersion,
    action: z.enum(['pause', 'resume', 'end', 'delete']),
    deleteTask: z.boolean().default(false),
  }),
  z.strictObject({
    operation: z.literal('read'),
    taskIds: z.array(uuid).max(100),
    includeTemplate: z.boolean().default(false),
  }),
  z.strictObject({
    operation: z.literal('complete'),
    taskId: uuid,
    listId: uuid,
    sortKey: z
      .number()
      .int()
      .min(Number.MIN_SAFE_INTEGER)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    receipt,
  }),
]);

export const prepareCreateResult = z.object({
  board_id: uuid,
  global_epoch: z.number().int().positive(),
  workspace_epoch: z.number().int().positive(),
});

export const completionPlanInput = z.object({
  transition_id: uuid,
  rule: TaskRecurrenceScheduleSchema.shape.rule,
  anchor_date: TaskRecurrenceScheduleSchema.shape.anchorDate,
  due_time: TaskRecurrenceScheduleSchema.shape.dueTime,
  start_offset_days: TaskRecurrenceScheduleSchema.shape.startOffsetDays,
  cursor_date: TaskRecurrenceScheduleSchema.shape.anchorDate,
  consumed_count: z.number().int().nonnegative(),
  description: z.string().nullable(),
});
