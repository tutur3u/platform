import {
  MAX_COLOR_LENGTH,
  MAX_TASK_DESCRIPTION_LENGTH,
  MAX_TASK_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { z } from 'zod';
import { taskFleetFields } from './task-fleet-fields';

export const CreateTaskSchema = z.object({
  ...taskFleetFields,
  name: z.string().min(1).max(MAX_TASK_NAME_LENGTH),
  description: z
    .string()
    .max(MAX_TASK_DESCRIPTION_LENGTH)
    .nullable()
    .optional(),
  description_yjs_state: z
    .array(z.number().int().min(0).max(255))
    .nullable()
    .optional(),
  listId: z.guid(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).nullable().optional(),
  start_date: z.string().max(MAX_COLOR_LENGTH).nullable().optional(),
  end_date: z.string().max(MAX_COLOR_LENGTH).nullable().optional(),
  estimation_points: z.number().nullable().optional(),
  label_ids: z.array(z.guid()).optional(),
  project_ids: z.array(z.guid()).optional(),
  assignee_ids: z.array(z.guid()).optional(),
  total_duration: z.number().nonnegative().nullable().optional(),
  is_splittable: z.boolean().nullable().optional(),
  min_split_duration_minutes: z.number().int().min(0).nullable().optional(),
  max_split_duration_minutes: z.number().int().min(0).nullable().optional(),
  calendar_hours: z.string().nullable().optional(),
  auto_schedule: z.boolean().nullable().optional(),
});
