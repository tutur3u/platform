import type {
  SupabaseClient,
  TypedSupabaseClient,
} from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// These equal the strict database limits on public.tasks (the
// *_strict_length_check, *_strict_bytes_check and *_strict_payload_size_check
// constraints), so an oversized value is a 400 instead of a database error.
export const TASK_FLEET_LIMITS = {
  needsUserReasonChars: 512,
  needsUserReasonBytes: 2048,
  payloadBytes: 8192,
} as const;

const utf8 = new TextEncoder();

const utf8ByteLength = (value: string) => utf8.encode(value).length;

// Postgres counts characters as code points, not UTF-16 units.
const codePointLength = (value: string) => [...value].length;

// Byte length of the Postgres jsonb text rendering, which the payload
// constraints measure: JSON.stringify escaping plus ", " and ": " separators.
export function jsonbTextByteLength(value: unknown): number {
  if (Array.isArray(value)) {
    const items = value.map(jsonbTextByteLength);
    return (
      2 +
      items.reduce((sum, bytes) => sum + bytes, 0) +
      2 * Math.max(items.length - 1, 0)
    );
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).filter(
      ([, entry]) => entry !== undefined
    );
    return (
      2 +
      entries.reduce(
        (sum, [key, entry]) =>
          sum + jsonbTextByteLength(key) + 2 + jsonbTextByteLength(entry),
        0
      ) +
      2 * Math.max(entries.length - 1, 0)
    );
  }
  return utf8ByteLength(JSON.stringify(value));
}

const payloadLimit = (field: string) =>
  [
    (value: unknown) =>
      jsonbTextByteLength(value) <= TASK_FLEET_LIMITS.payloadBytes,
    {
      message: `${field} must be at most ${TASK_FLEET_LIMITS.payloadBytes} bytes`,
    },
  ] as const;

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
    .refine(...payloadLimit('virtual_assignees'))
    .nullable()
    .optional(),
  needs_user: z.boolean().nullable().optional(),
  needs_user_reason: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) =>
        codePointLength(value) <= TASK_FLEET_LIMITS.needsUserReasonChars,
      {
        message: `needs_user_reason must be at most ${TASK_FLEET_LIMITS.needsUserReasonChars} characters`,
      }
    )
    .refine(
      (value) =>
        utf8ByteLength(value) <= TASK_FLEET_LIMITS.needsUserReasonBytes,
      {
        message: `needs_user_reason must be at most ${TASK_FLEET_LIMITS.needsUserReasonBytes} bytes`,
      }
    )
    .nullable()
    .optional(),
  task_resources: z
    .array(
      z.object({
        kind: z.literal('link'),
        url: z.url({ protocol: /^https?$/, normalize: true }).max(2048),
        title: z.string().trim().min(1).max(256).optional(),
      })
    )
    .max(50)
    .refine(...payloadLimit('task_resources'))
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
// Columns the generated types already declare keep their generated write types,
// so a generated `tasks` Insert or Update stays assignable; Zod validates the
// JSON shapes at the route boundary.
type WithFleetWrites<Write> = Write & Partial<Omit<FleetFields, keyof Write>>;

type FleetDatabase = Omit<Database, 'public'> & {
  public: Omit<Public, 'Tables'> & {
    Tables: Omit<Public['Tables'], 'tasks'> & {
      tasks: Omit<Tasks, 'Insert' | 'Row' | 'Update'> & {
        Row: Omit<Tasks['Row'], keyof TaskFleetRow> & TaskFleetRow;
        Insert: WithFleetWrites<Tasks['Insert']>;
        Update: WithFleetWrites<Tasks['Update']>;
      };
    };
  };
};

// Reads narrow the generated JSON fleet columns to their validated shapes.
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

// A literal select stays a parseable literal typed with the fleet columns.
// Rows are cast to the task read models, and a database without the columns
// is queried again with `enabled` false, so absent fields read as undefined.
// A `string` select stays `string`, for callers that cast their rows.
export function withTaskFleetColumns<Columns extends string>(
  columns: Columns,
  enabled: boolean
) {
  return (
    enabled ? `${columns},${taskFleetSelect}` : columns
  ) as string extends Columns ? string : `${Columns},${typeof taskFleetSelect}`;
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
