import {
  createWorkspaceCalendarEvent,
  listWorkspaceCalendarEvents,
} from '@tuturuuu/internal-api';
import { z } from 'zod';

const rangeSchema = z
  .object({
    start_at: z.iso.datetime({ offset: true }),
    end_at: z.iso.datetime({ offset: true }),
  })
  .refine(
    (v) =>
      Date.parse(v.end_at) > Date.parse(v.start_at) &&
      Date.parse(v.end_at) - Date.parse(v.start_at) <= 31 * 86400000,
    'Use a positive date range of at most 31 days'
  );
const eventSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    start_at: z.iso.datetime({ offset: true }),
    end_at: z.iso.datetime({ offset: true }),
    description: z.string().max(5000).optional(),
    location: z.string().max(500).optional(),
  })
  .refine(
    (v) => Date.parse(v.end_at) > Date.parse(v.start_at),
    'End must follow start'
  );

export const LIVE_MUTATION_TOOLS = new Set([
  'create_task',
  'update_task',
  'delete_task',
  'create_calendar_event',
]);

export async function executeWorkspaceLiveTool(
  name: string,
  args: Record<string, unknown>,
  wsId: string,
  signal?: AbortSignal
): Promise<Record<string, unknown> | null> {
  if (name === 'get_current_time') {
    const now = new Date();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      utc: now.toISOString(),
      timeZone,
      local: now.toLocaleString('en-CA', { timeZone }),
      utcOffsetMinutes: -now.getTimezoneOffset(),
    };
  }
  if (name === 'get_calendar_events') {
    const range = rangeSchema.parse(args);
    const result = await listWorkspaceCalendarEvents(wsId, range, { signal });
    return {
      count: result.count,
      truncated: result.data.length > 50,
      events: result.data.slice(0, 50).map((event) => ({
        id: event.id,
        title: event.title,
        start_at: event.start_at,
        end_at: event.end_at,
        location: event.location,
      })),
    };
  }
  if (name === 'create_calendar_event') {
    const payload = eventSchema.parse(args);
    const event = await createWorkspaceCalendarEvent(
      wsId,
      {
        ...payload,
        source: { provider: 'tuturuuu' },
      },
      { signal }
    );
    return { success: true, event };
  }
  return null;
}
