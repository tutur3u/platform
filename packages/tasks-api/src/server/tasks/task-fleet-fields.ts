import type {
  SupabaseClient,
  TypedSupabaseClient,
} from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const taskFleetFields = {
  virtual_assignees: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(128),
        kind: z.literal('agent'),
        position: z.number().int().min(0).max(49),
      })
    )
    .max(50)
    .nullable()
    .optional(),
  needs_user: z.boolean().nullable().optional(),
  needs_user_reason: z.string().trim().min(1).max(1000).nullable().optional(),
  task_resources: z
    .array(
      z.object({
        kind: z.literal('link'),
        url: z.url({ protocol: /^https?$/, normalize: true }).max(2048),
        title: z.string().trim().min(1).max(256).optional(),
      })
    )
    .max(50)
    .nullable()
    .optional(),
};

export const taskFleetUpdateSchema = z.object(taskFleetFields);

type FleetFields = {
  [Key in keyof typeof taskFleetFields]-?: Exclude<
    z.output<(typeof taskFleetFields)[Key]>,
    undefined
  >;
};

export type TaskFleetRow = FleetFields & { updated_at: string | null };

type Public = Database['public'];
type Tasks = Public['Tables']['tasks'];
type FleetDatabase = Database & {
  public: {
    Tables: {
      tasks: {
        Row: Tasks['Row'] & TaskFleetRow;
        Insert: Tasks['Insert'] & Partial<FleetFields>;
        Update: Tasks['Update'] & Partial<FleetFields>;
      };
    };
  };
};

// The migration supplies these columns. Use the schema projection until typegen
// can run against a migrated database.
export function taskFleetClient(client: TypedSupabaseClient) {
  return client as unknown as SupabaseClient<FleetDatabase>;
}

export const taskFleetSelect =
  'virtual_assignees,needs_user,needs_user_reason,task_resources,updated_at';

export function isMissingTaskFleetColumn(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === '42703' || error.code === 'PGRST204') &&
    'message' in error &&
    typeof error.message === 'string' &&
    /\b(?:virtual_assignees|needs_user|needs_user_reason|task_resources|updated_at)\b/.test(
      error.message
    )
  );
}

export function taskFleetFieldsUnavailable() {
  return NextResponse.json(
    { error: 'Task fleet fields are not available yet' },
    { status: 503 }
  );
}

export function withTaskFleetColumns(columns: string, enabled: boolean) {
  return enabled ? `${columns},${taskFleetSelect}` : columns;
}

export function serializeTaskFleetFields(task: Partial<TaskFleetRow>) {
  return {
    virtual_assignees: task.virtual_assignees,
    needs_user: task.needs_user,
    needs_user_reason: task.needs_user_reason,
    task_resources: task.task_resources,
    updated_at: task.updated_at ?? undefined,
  };
}
