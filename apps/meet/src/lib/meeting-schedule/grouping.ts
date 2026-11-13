import { z } from 'zod';
import type {
  MeetingCalendarEvent,
  ScheduledMeeting,
  UtcInstant,
  ViewerTimezone,
} from './types';

const instantSchema = z.iso.datetime({ offset: true });

export function utcInstant(value: string): UtcInstant | null {
  const parsed = instantSchema.safeParse(value);
  if (!parsed.success) return null;
  const timestamp = Date.parse(parsed.data);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

const requiredInstant = z.string().transform((value, ctx) => {
  const instant = utcInstant(value);
  if (instant) return instant;
  ctx.addIssue({ code: 'custom', message: 'Expected an explicit UTC offset' });
  return z.NEVER;
});

export const meetingRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  time: z.string().transform(utcInstant),
  created_at: requiredInstant,
  creator_id: z.string(),
});

export const calendarRowSchema = z.object({
  id: z.string(),
  created_at: requiredInstant,
  start_at: requiredInstant,
  end_at: requiredInstant,
  scheduling_metadata: z.object({
    type: z.literal('tuturuuu_meeting'),
    meeting_id: z.string(),
  }),
});

export type MeetingRow = z.infer<typeof meetingRowSchema>;
export type CalendarRow = z.infer<typeof calendarRowSchema>;

/** Oldest event wins, with the id breaking equal-created-at ties. */
export function dedupeCalendarEvents(rows: CalendarRow[]) {
  const byMeeting = new Map<string, MeetingCalendarEvent>();
  const ordered = [...rows].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );
  for (const event of ordered) {
    const id = event.scheduling_metadata.meeting_id;
    if (!byMeeting.has(id)) {
      byMeeting.set(id, {
        id: event.id,
        startAt: event.start_at,
        endAt: event.end_at,
      });
    }
  }
  return byMeeting;
}

/** Meeting time classifies rows even when Calendar access is forbidden. */
export function groupMeetings(
  rows: MeetingRow[],
  calendar: Map<string, MeetingCalendarEvent>,
  now: UtcInstant
): { upcoming: ScheduledMeeting[]; past: ScheduledMeeting[] } {
  const upcoming: ScheduledMeeting[] = [];
  const past: ScheduledMeeting[] = [];
  const boundary = utcInstant(now);
  if (!boundary) throw new Error('Invalid schedule evaluation instant');
  const unique = new Map(rows.map((row) => [row.id, row]));
  for (const row of unique.values()) {
    const meeting: ScheduledMeeting = {
      id: row.id,
      name: row.name,
      time: row.time,
      createdAt: row.created_at,
      creatorId: row.creator_id,
      calendar: calendar.get(row.id) ?? null,
    };
    if (row.time && row.time > boundary) upcoming.push(meeting);
    else past.push(meeting);
  }
  upcoming.sort(
    (a, b) =>
      (a.time ?? '').localeCompare(b.time ?? '') || a.id.localeCompare(b.id)
  );
  past.sort(
    (a, b) =>
      (b.time ?? b.createdAt).localeCompare(a.time ?? a.createdAt) ||
      a.id.localeCompare(b.id)
  );
  return { upcoming, past };
}

export function viewerTimezone(value: unknown): ViewerTimezone {
  if (typeof value === 'string' && value.trim()) {
    try {
      const timeZone = new Intl.DateTimeFormat('en', {
        timeZone: value,
      }).resolvedOptions().timeZone;
      return { source: 'user-profile', timeZone };
    } catch {
      // Missing/invalid preferences defer to the browser; no server-zone guess.
    }
  }
  return { source: 'browser', timeZone: null };
}
