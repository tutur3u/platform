import type {
  CurrentMeetings,
  LiveMeeting,
  PastCollapseChoice,
  PastFilter,
  ScheduledMeeting,
  UtcInstant,
} from './types';

export const DEFAULT_PAST_CHOICE: PastCollapseChoice = 'collapsed';

/** Live meetings to show, or null when the Current section must be absent. */
export function currentMeetingsToShow(
  current: CurrentMeetings
): LiveMeeting[] | null {
  if (current.currentSource !== 'presence') return null;
  return current.current.length > 0 ? current.current : null;
}

export function filterPastMeetings(
  meetings: ScheduledMeeting[],
  filter: PastFilter,
  accountId: string
) {
  return filter === 'mine'
    ? meetings.filter((meeting) => meeting.creatorId === accountId)
    : meetings;
}

function instantMs(value: UtcInstant | null) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** The instant a meeting is anchored to: its Calendar start, then its time. */
export function meetingStart(meeting: ScheduledMeeting): UtcInstant | null {
  if (meeting.calendar && instantMs(meeting.calendar.startAt) !== null)
    return meeting.calendar.startAt;
  return instantMs(meeting.time) === null ? null : meeting.time;
}

/**
 * Splits meetings by start time relative to `now`. Meetings without a usable
 * time are past. Upcoming is soonest first; past is newest first.
 */
export function classifyMeetings(
  meetings: ScheduledMeeting[],
  now: UtcInstant
): { upcoming: ScheduledMeeting[]; past: ScheduledMeeting[] } {
  const nowMs = Date.parse(now);
  const upcoming: { meeting: ScheduledMeeting; at: number }[] = [];
  const past: { meeting: ScheduledMeeting; at: number }[] = [];
  for (const meeting of meetings) {
    const start = instantMs(meetingStart(meeting));
    if (start !== null && start >= nowMs) upcoming.push({ meeting, at: start });
    else
      past.push({
        meeting,
        at: start ?? instantMs(meeting.createdAt) ?? 0,
      });
  }
  upcoming.sort((a, b) => a.at - b.at);
  past.sort((a, b) => b.at - a.at);
  return {
    upcoming: upcoming.map((entry) => entry.meeting),
    past: past.map((entry) => entry.meeting),
  };
}

/** Calendar-day key (YYYY-MM-DD) of an instant in a timezone. */
export function dayKey(value: UtcInstant, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).format(new Date(value));
}

type DayGroup = {
  key: string;
  /** First meeting start in the group, used for the day label. */
  anchor: UtcInstant;
  meetings: ScheduledMeeting[];
};

export type UpcomingDay = DayGroup & { relative: 'today' | 'tomorrow' | null };

export type PastDay =
  | (DayGroup & { relative: 'today' | 'yesterday' | null })
  /** Meetings without a usable start; they are past but have no day. */
  | {
      key: 'undated';
      anchor: null;
      relative: null;
      meetings: ScheduledMeeting[];
    };

/** Groups consecutive meetings that start on the same calendar day. */
function groupAdjacentByDay(
  meetings: ScheduledMeeting[],
  timeZone: string
): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const meeting of meetings) {
    const start = meetingStart(meeting);
    if (!start) continue;
    const key = dayKey(start, timeZone);
    const last = groups.at(-1);
    if (last?.key === key) {
      last.meetings.push(meeting);
      continue;
    }
    groups.push({ anchor: start, key, meetings: [meeting] });
  }
  return groups;
}

function offsetDayKey(now: UtcInstant, timeZone: string, days: number) {
  return dayKey(
    new Date(Date.parse(now) + days * 24 * 60 * 60 * 1000).toISOString(),
    timeZone
  );
}

/** Groups soonest-first upcoming meetings by calendar day in `timeZone`. */
export function groupUpcomingByDay(
  meetings: ScheduledMeeting[],
  timeZone: string,
  now: UtcInstant
): UpcomingDay[] {
  const today = dayKey(now, timeZone);
  const tomorrow = offsetDayKey(now, timeZone, 1);
  return groupAdjacentByDay(meetings, timeZone).map((group) => ({
    ...group,
    relative:
      group.key === today
        ? 'today'
        : group.key === tomorrow
          ? 'tomorrow'
          : null,
  }));
}

/** Groups newest-first past meetings by calendar day in `timeZone`. */
export function groupPastByDay(
  meetings: ScheduledMeeting[],
  timeZone: string,
  now: UtcInstant
): PastDay[] {
  const today = dayKey(now, timeZone);
  const yesterday = offsetDayKey(now, timeZone, -1);
  const groups: PastDay[] = groupAdjacentByDay(meetings, timeZone).map(
    (group) => ({
      ...group,
      relative:
        group.key === today
          ? 'today'
          : group.key === yesterday
            ? 'yesterday'
            : null,
    })
  );
  const undated = meetings.filter((meeting) => !meetingStart(meeting));
  if (undated.length)
    groups.push({
      anchor: null,
      key: 'undated',
      meetings: undated,
      relative: null,
    });
  return groups;
}

/** "45 min" or "1 hr 15 min" in the viewer's locale, or null without a valid range. */
export function formatMeetingDuration(
  meeting: ScheduledMeeting,
  locale: string
): string | null {
  const calendar = meeting.calendar;
  if (!calendar) return null;
  const start = Date.parse(calendar.startAt);
  const end = Date.parse(calendar.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return null;
  const totalMinutes = Math.round((end - start) / 60_000);
  if (totalMinutes < 1) return null;
  const unit = (value: number, name: 'hour' | 'minute') =>
    new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: name,
      unitDisplay: 'short',
    }).format(value);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return [
    hours > 0 ? unit(hours, 'hour') : null,
    minutes > 0 || hours === 0 ? unit(minutes, 'minute') : null,
  ]
    .filter(Boolean)
    .join(' ');
}
