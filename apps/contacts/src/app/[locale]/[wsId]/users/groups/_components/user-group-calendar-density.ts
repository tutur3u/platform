import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import dayjs from 'dayjs';
import '@tuturuuu/users-core/lib/dayjs-setup';
import { DEFAULT_SCHEDULE_TIMEZONE } from './session-time-utils';

export const GROUPED_SESSION_EVENT_PREFIX = 'user-group-timeblock:';

export interface GroupedSessionTimeblock {
  endAt: string;
  eventId: string;
  sessions: WorkspaceUserGroupSession[];
  startAt: string;
  timezone: string;
}

interface CalendarDensityLabels {
  filesAttachedCount: (count: number) => string;
  groupedTimeblockDescription: (values: {
    count: number;
    groups: string;
  }) => string;
  groupedTimeblockTitle: (count: number) => string;
  moreSessions: (count: number) => string;
  recurringBadge: string;
  untitledSession: string;
}

interface BuildUserGroupCalendarDensityOptions {
  groupSessions: boolean;
  labels: CalendarDensityLabels;
  sessions: WorkspaceUserGroupSession[];
  timezone: string;
  wsId: string;
}

export interface UserGroupCalendarDensityResult {
  calendarEvents: CalendarEvent[];
  groupedSessionCount: number;
  groupedTimeblockCount: number;
  timeblocksByEventId: Map<string, GroupedSessionTimeblock>;
  visibleEventCount: number;
  visibleSessionCount: number;
}

export function isGroupedSessionEventId(eventId: string) {
  return eventId.startsWith(GROUPED_SESSION_EVENT_PREFIX);
}

function sessionDisplayName(
  session: WorkspaceUserGroupSession,
  untitledSession: string
) {
  return session.groupName || session.title || untitledSession;
}

function zonedDate(value: string, timezone: string) {
  if (!timezone || timezone === 'auto') return dayjs(value);
  return dayjs(value).tz(timezone);
}

function sessionBucketKey(
  session: WorkspaceUserGroupSession,
  timezone: string
) {
  const start = zonedDate(session.startsAt, timezone);
  const end = zonedDate(session.endsAt, timezone);

  return [
    start.format('YYYY-MM-DD'),
    start.format('HH:mm'),
    end.format('YYYY-MM-DD'),
    end.format('HH:mm'),
  ].join('|');
}

function eventIdFromBucketKey(bucketKey: string) {
  return `${GROUPED_SESSION_EVENT_PREFIX}${bucketKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function sortSessionsByGroupName(
  sessions: WorkspaceUserGroupSession[],
  untitledSession: string
) {
  return [...sessions].sort((a, b) => {
    const nameCompare = sessionDisplayName(a, untitledSession).localeCompare(
      sessionDisplayName(b, untitledSession)
    );
    if (nameCompare !== 0) return nameCompare;
    return a.startsAt.localeCompare(b.startsAt);
  });
}

function sessionCalendarEvent(
  session: WorkspaceUserGroupSession,
  labels: CalendarDensityLabels,
  wsId: string
): CalendarEvent {
  const tags = session.tags.map((tag) => tag.name).join(', ');
  const metadata = [
    session.seriesId ? labels.recurringBadge : null,
    session.files.length
      ? labels.filesAttachedCount(session.files.length)
      : null,
    tags || null,
    session.startTimezone || DEFAULT_SCHEDULE_TIMEZONE,
  ].filter(Boolean);

  return {
    id: session.id,
    title: session.groupName || session.title || labels.untitledSession,
    description: [metadata.join(' / '), session.description]
      .filter(Boolean)
      .join('\n'),
    start_at: session.startsAt,
    end_at: session.endsAt,
    color: session.seriesId ? 'PURPLE' : session.tags.length ? 'GREEN' : 'BLUE',
    locked: false,
    ws_id: wsId,
  };
}

function groupedCalendarEvent(
  timeblock: GroupedSessionTimeblock,
  labels: CalendarDensityLabels,
  wsId: string
): CalendarEvent {
  const visibleGroups = timeblock.sessions
    .slice(0, 4)
    .map((session) => sessionDisplayName(session, labels.untitledSession));
  const remainingCount = timeblock.sessions.length - visibleGroups.length;
  const groups =
    remainingCount > 0
      ? `${visibleGroups.join(', ')} ${labels.moreSessions(remainingCount)}`
      : visibleGroups.join(', ');

  return {
    id: timeblock.eventId,
    title: labels.groupedTimeblockTitle(timeblock.sessions.length),
    description: labels.groupedTimeblockDescription({
      count: timeblock.sessions.length,
      groups,
    }),
    start_at: timeblock.startAt,
    end_at: timeblock.endAt,
    color: 'INDIGO',
    locked: true,
    ws_id: wsId,
  };
}

export function buildUserGroupCalendarDensity({
  groupSessions,
  labels,
  sessions,
  timezone,
  wsId,
}: BuildUserGroupCalendarDensityOptions): UserGroupCalendarDensityResult {
  if (!groupSessions) {
    const calendarEvents = sessions.map((session) =>
      sessionCalendarEvent(session, labels, wsId)
    );

    return {
      calendarEvents,
      groupedSessionCount: 0,
      groupedTimeblockCount: 0,
      timeblocksByEventId: new Map(),
      visibleEventCount: calendarEvents.length,
      visibleSessionCount: sessions.length,
    };
  }

  const buckets = new Map<string, WorkspaceUserGroupSession[]>();

  for (const session of sessions) {
    const key = sessionBucketKey(session, timezone);
    const bucket = buckets.get(key) ?? [];
    bucket.push(session);
    buckets.set(key, bucket);
  }

  const calendarEvents: CalendarEvent[] = [];
  const timeblocksByEventId = new Map<string, GroupedSessionTimeblock>();
  let groupedSessionCount = 0;

  for (const [bucketKey, bucketSessions] of Array.from(buckets.entries()).sort(
    ([a], [b]) => a.localeCompare(b)
  )) {
    if (bucketSessions.length < 2) {
      calendarEvents.push(
        sessionCalendarEvent(bucketSessions[0]!, labels, wsId)
      );
      continue;
    }

    const sortedSessions = sortSessionsByGroupName(
      bucketSessions,
      labels.untitledSession
    );
    const eventId = eventIdFromBucketKey(bucketKey);
    const timeblock: GroupedSessionTimeblock = {
      endAt: sortedSessions[0]!.endsAt,
      eventId,
      sessions: sortedSessions,
      startAt: sortedSessions[0]!.startsAt,
      timezone: timezone || DEFAULT_SCHEDULE_TIMEZONE,
    };

    timeblocksByEventId.set(eventId, timeblock);
    calendarEvents.push(groupedCalendarEvent(timeblock, labels, wsId));
    groupedSessionCount += sortedSessions.length;
  }

  return {
    calendarEvents,
    groupedSessionCount,
    groupedTimeblockCount: timeblocksByEventId.size,
    timeblocksByEventId,
    visibleEventCount: calendarEvents.length,
    visibleSessionCount: sessions.length,
  };
}
