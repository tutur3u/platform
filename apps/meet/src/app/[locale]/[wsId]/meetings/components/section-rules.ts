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

export type UpcomingDay = {
  key: string;
  relative: 'today' | 'tomorrow' | null;
  /** First meeting start in the group, used for the day label. */
  anchor: UtcInstant;
  meetings: ScheduledMeeting[];
};

/** Groups soonest-first upcoming meetings by calendar day in `timeZone`. */
export function groupUpcomingByDay(
  meetings: ScheduledMeeting[],
  timeZone: string,
  now: UtcInstant
): UpcomingDay[] {
  const today = dayKey(now, timeZone);
  const tomorrow = dayKey(
    new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString(),
    timeZone
  );
  const groups: UpcomingDay[] = [];
  for (const meeting of meetings) {
    const start = meetingStart(meeting);
    if (!start) continue;
    const key = dayKey(start, timeZone);
    const last = groups.at(-1);
    if (last?.key === key) {
      last.meetings.push(meeting);
      continue;
    }
    groups.push({
      anchor: start,
      key,
      meetings: [meeting],
      relative: key === today ? 'today' : key === tomorrow ? 'tomorrow' : null,
    });
  }
  return groups;
}
