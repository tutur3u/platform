import { DEV_MODE } from '@/constants/common';
import type { Database } from '@tuturuuu/types';
import {
  MAX_TASK_DESCRIPTION_LENGTH,
  MAX_TASK_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { z } from 'zod';

export const paramsSchema = z.object({
  wsId: z.string().min(1),
  taskId: z.uuid(),
});

export const updateTaskSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_TASK_NAME_LENGTH).optional(),
    description: z
      .string()
      .max(MAX_TASK_DESCRIPTION_LENGTH)
      .nullable()
      .optional(),
    priority: z
      .enum(['low', 'normal', 'high', 'critical'])
      .nullable()
      .optional(),
    start_date: z.string().datetime().nullable().optional(),
    end_date: z.string().datetime().nullable().optional(),
    completed: z.boolean().optional(),
    list_id: z.uuid().optional(),
    sort_key: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
    deleted: z.boolean().optional(),
    estimation_points: z.number().int().min(0).max(8).nullable().optional(),
    label_ids: DEV_MODE ? z.array(z.string().max(255)).optional() : z.array(z.uuid()).optional(),
    project_ids: DEV_MODE ? z.array(z.string().max(255)).optional() : z.array(z.uuid()).optional(),
    assignee_ids: DEV_MODE ? z.array(z.string().max(255)).optional() : z.array(z.uuid()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one task field is required',
  });

export const restoreTaskSchema = z.object({
  restore: z.literal(true),
});

export type TaskPriority = Database['public']['Enums']['task_priority'];

type TaskBaseRow = Pick<
  Database['public']['Tables']['tasks']['Row'],
  | 'id'
  | 'display_number'
  | 'name'
  | 'description'
  | 'priority'
  | 'completed'
  | 'completed_at'
  | 'start_date'
  | 'end_date'
  | 'estimation_points'
  | 'sort_key'
  | 'created_at'
  | 'closed_at'
  | 'deleted_at'
  | 'list_id'
>;

type TaskListContext = Pick<
  Database['public']['Tables']['task_lists']['Row'],
  'id' | 'name' | 'status' | 'board_id'
> & {
  workspace_boards: Pick<
    Database['public']['Tables']['workspace_boards']['Row'],
    'id' | 'ws_id' | 'name'
  > | null;
};

type TaskAssigneeContext = {
  user: Pick<
    Database['public']['Tables']['users']['Row'],
    'id' | 'display_name' | 'avatar_url'
  > | null;
};

type TaskLabelContext = {
  label: Pick<
    Database['public']['Tables']['workspace_task_labels']['Row'],
    'id' | 'name' | 'color' | 'created_at'
  > | null;
};

type TaskProjectContext = {
  project: Pick<
    Database['public']['Tables']['task_projects']['Row'],
    'id' | 'name' | 'status'
  > | null;
};

export type TaskRecord = TaskBaseRow & {
  task_lists: TaskListContext | null;
  assignees: TaskAssigneeContext[] | null;
  labels: TaskLabelContext[] | null;
  projects: TaskProjectContext[] | null;
};

export type TaskMutationResult = Pick<
  Database['public']['Tables']['tasks']['Row'],
  'id' | 'list_id'
>;
