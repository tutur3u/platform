import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { z } from 'zod';

export const calendarTimezoneSchema = z
  .string()
  .max(100)
  .refine(
    (value) => {
      if (value === 'auto') return true;
      if (
        /^[+-]/.test(value) ||
        !/^[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)*$/.test(value)
      )
        return false;
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Expected a supported IANA timezone or auto' }
  );

const base = {
  timezone: calendarTimezoneSchema.optional(),
  first_day_of_week: z
    .enum(['auto', 'sunday', 'monday', 'saturday'])
    .optional(),
};
export const personalCalendarSettingsSchema = z.object({
  ...base,
  time_format: z.enum(['auto', '12h', '24h']).optional(),
});
export const workspaceCalendarSettingsSchema = z.object({
  ...base,
  energy_profile: z.string().max(100).optional(),
  scheduling_settings: z.record(z.string(), z.any()).optional(),
});

export type CalendarSettingsContext = {
  supabase: TypedSupabaseClient;
  userId: string;
};
type Operation = { method: 'GET' } | { method: 'PATCH'; body: unknown };
export class CalendarSettingsError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: z.core.$ZodIssue[]
  ) {
    super(message);
  }
}
export function calendarSettingsFailure(error: unknown): {
  status: number;
  message: string;
  details?: z.core.$ZodIssue[];
} | null {
  return error instanceof CalendarSettingsError
    ? {
        status: error.status,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      }
    : null;
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new CalendarSettingsError(
      400,
      'Invalid request data',
      result.error.issues
    );
  return result.data;
}
const personalColumns = 'timezone, first_day_of_week, time_format';
const workspaceColumns =
  'timezone, first_day_of_week, energy_profile, scheduling_settings';

export async function personalCalendarSettings(
  { supabase, userId }: CalendarSettingsContext,
  operation: Operation
) {
  const payload =
    operation.method === 'PATCH'
      ? parse(personalCalendarSettingsSchema, operation.body)
      : undefined;
  const query = supabase.from('user_private_details');
  const result =
    operation.method === 'PATCH'
      ? await query
          .update(payload ?? {})
          .eq('user_id', userId)
          .select(personalColumns)
          .single()
      : await query.select(personalColumns).eq('user_id', userId).single();
  if (result.error || !result.data)
    throw new CalendarSettingsError(
      500,
      operation.method === 'GET'
        ? 'Failed to fetch user calendar settings'
        : 'Failed to update user calendar settings'
    );
  return {
    timezone: result.data.timezone || 'auto',
    first_day_of_week: result.data.first_day_of_week || 'auto',
    time_format: result.data.time_format || 'auto',
  };
}

/** Identity and workspace aliases are resolved by the request adapter. */
export async function workspaceCalendarSettings(
  { supabase, userId }: CalendarSettingsContext,
  wsId: string,
  operation: Operation
) {
  const membership = await supabase
    .from('workspace_members')
    .select('type')
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .maybeSingle();
  if (membership.error)
    throw new CalendarSettingsError(500, 'Failed to verify workspace access');
  if (membership.data?.type !== 'MEMBER')
    throw new CalendarSettingsError(403, 'Workspace access denied');
  if (operation.method === 'PATCH') {
    const permission = await supabase.rpc('has_workspace_permission', {
      p_user_id: userId,
      p_ws_id: wsId,
      p_permission: 'manage_workspace_settings',
    });
    if (permission.error)
      throw new CalendarSettingsError(
        500,
        'Failed to verify workspace settings permissions'
      );
    if (!permission.data)
      throw new CalendarSettingsError(
        403,
        'Insufficient workspace settings permissions'
      );
  }
  const query = supabase.from('workspaces');
  const result = await (async () => {
    if (operation.method === 'PATCH') {
      const payload = parse(workspaceCalendarSettingsSchema, operation.body);
      if (!Object.keys(payload).length)
        throw new CalendarSettingsError(400, 'No calendar settings provided');
      return await query
        .update(payload)
        .eq('id', wsId)
        .select(workspaceColumns)
        .single();
    } else {
      return await query.select(workspaceColumns).eq('id', wsId).single();
    }
  })();
  if (result.error || !result.data)
    throw new CalendarSettingsError(
      500,
      operation.method === 'GET'
        ? 'Failed to fetch workspace calendar settings'
        : 'Failed to update workspace calendar settings'
    );
  return {
    timezone: result.data.timezone || 'auto',
    first_day_of_week: result.data.first_day_of_week || 'auto',
    energy_profile: result.data.energy_profile || 'morning_person',
    scheduling_settings: result.data.scheduling_settings || {
      min_buffer: 5,
      preferred_buffer: 15,
    },
  };
}
