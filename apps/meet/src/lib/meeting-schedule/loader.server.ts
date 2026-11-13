import '@tanstack/react-start/server-only';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { z } from 'zod';
import {
  type CalendarRow,
  calendarRowSchema,
  dedupeCalendarEvents,
  groupMeetings,
  type MeetingRow,
  meetingRowSchema,
  viewerTimezone,
} from './grouping';
import { PAST_COLLAPSE_CONFIG, pastPreference } from './preference';
import type { CalendarAccess, MeetingSchedule } from './types';

interface ScheduleOptions {
  supabase: TypedSupabaseClient;
  /** Resolved by getMeetWorkspaceContext before calling this loader. */
  wsId: string;
  userId: string;
  permissions: Awaited<ReturnType<typeof getPermissions>>;
  search: string;
}

const PAGE_SIZE = 500;
const MAX_PAGES = 200;
const preferenceRow = z.object({ value: z.string() }).nullable();
const profileRow = z.object({ timezone: z.string().nullable() }).nullable();

async function meetingRows({ supabase, wsId, search }: ScheduleOptions) {
  const rows: MeetingRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    let query = supabase
      .from('workspace_meetings')
      .select('id, name, time, created_at, creator_id')
      .eq('ws_id', wsId)
      .order('time', { ascending: false })
      .order('id', { ascending: true });
    if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);
    const { data, error } = await query.range(
      page * PAGE_SIZE,
      (page + 1) * PAGE_SIZE - 1
    );
    if (error) throw error;
    const batch = z.array(meetingRowSchema).parse(data ?? []);
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
  throw new Error('Meeting schedule exceeds read limit');
}

async function calendarRows(
  { supabase, wsId }: ScheduleOptions,
  ids: string[]
) {
  const rows: CalendarRow[] = [];
  // Batches bound PostgREST URL size; pagination retains duplicate event rows.
  for (let offset = 0; offset < ids.length; offset += 100) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await supabase
        .from('workspace_calendar_events')
        .select('id, start_at, end_at, created_at, scheduling_metadata')
        .eq('ws_id', wsId)
        .eq('scheduling_metadata->>type', 'tuturuuu_meeting')
        .in('scheduling_metadata->>meeting_id', ids.slice(offset, offset + 100))
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      const batch = z.array(calendarRowSchema).parse(data ?? []);
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      if (page === MAX_PAGES - 1)
        throw new Error('Meeting calendar exceeds read limit');
    }
  }
  return rows;
}

/** Only call after the app session and workspace membership have been resolved. */
export async function loadMeetingSchedule(
  options: ScheduleOptions
): Promise<MeetingSchedule> {
  const { supabase, userId, wsId, permissions } = options;
  const [rows, preference, profile] = await Promise.all([
    meetingRows(options),
    supabase
      .from('user_workspace_configs')
      .select('value')
      .eq('user_id', userId)
      .eq('ws_id', wsId)
      .eq('id', PAST_COLLAPSE_CONFIG)
      .maybeSingle(),
    supabase
      .from('user_private_details')
      .select('timezone')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  if (preference.error) throw preference.error;
  if (profile.error) throw profile.error;
  const choice = preferenceRow.parse(preference.data)?.value;
  const zone = profileRow.parse(profile.data)?.timezone;
  let calendarAccess: CalendarAccess = { status: 'forbidden' };
  let events: CalendarRow[] = [];
  if (permissions && !permissions.withoutPermission('manage_calendar')) {
    try {
      events = await calendarRows(
        options,
        rows.map((row) => row.id)
      );
      calendarAccess = { status: 'available' };
    } catch {
      // A Calendar outage must not hide authorized workspace meetings.
      calendarAccess = { status: 'unavailable' };
    }
  }
  const evaluatedAt = new Date().toISOString();
  return {
    ...groupMeetings(rows, dedupeCalendarEvents(events), evaluatedAt),
    currentSource: 'unavailable',
    current: [],
    calendarAccess,
    viewerTimezone: viewerTimezone(zone),
    pastPreference: pastPreference(userId, wsId, choice),
    search: options.search,
    evaluatedAt,
  };
}
