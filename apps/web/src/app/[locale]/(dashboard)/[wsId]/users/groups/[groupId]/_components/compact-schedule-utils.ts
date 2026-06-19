import type {
  ListWorkspaceUserGroupSessionsResponse,
  UpdateWorkspaceUserGroupSessionPayload,
  WorkspaceUserGroupMissingSessionOccurrence,
  WorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import dayjs from 'dayjs';
import '@/lib/dayjs-setup';

export const COMPACT_SCHEDULE_TIMEZONE = 'Asia/Ho_Chi_Minh';

export type CompactScheduleDay = {
  date: Date;
  key: string;
};

export type CompactScheduleDayBucket = {
  missing: WorkspaceUserGroupMissingSessionOccurrence[];
  sessions: WorkspaceUserGroupSession[];
};

export type CompactScheduleData = ListWorkspaceUserGroupSessionsResponse & {
  ending_date: string | null;
  month: string;
  range: { from: string; month: string; to: string };
  starting_date: string | null;
};

export type DraftSession = {
  endsAt: string;
  startsAt: string;
};

export function compactScheduleQueryKey(
  wsId: string,
  groupId: string,
  range: { from: string; to: string }
) {
  return [
    'workspace-user-group-sessions',
    wsId,
    'compact',
    groupId,
    range.from,
    range.to,
  ] as const;
}

export function normalizeCompactScheduleMonth(month?: string | null) {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const parsed = dayjs(`${month}-01`, 'YYYY-MM-DD', true);
    if (parsed.isValid()) return parsed.format('YYYY-MM');
  }

  return dayjs().format('YYYY-MM');
}

export function compactScheduleMonthRange(month?: string | null) {
  const normalized = normalizeCompactScheduleMonth(month);
  const monthStart = dayjs(`${normalized}-01`, 'YYYY-MM-DD', true);
  const weekday = monthStart.day();
  const offset = weekday === 0 ? 6 : weekday - 1;
  const start = monthStart.subtract(offset, 'day').startOf('day');
  const end = start.add(41, 'day').endOf('day');

  return {
    from: start.toISOString(),
    month: normalized,
    to: end.toISOString(),
  };
}

export function compactScheduleMonthDays(month?: string | null) {
  const range = compactScheduleMonthRange(month);
  const start = dayjs(range.from);

  return Array.from({ length: 42 }, (_, index) => {
    const date = start.add(index, 'day');
    return {
      date: date.toDate(),
      key: date.format('YYYY-MM-DD'),
    };
  });
}

export function sessionDateKey(
  session: WorkspaceUserGroupSession,
  timezone = session.startTimezone || COMPACT_SCHEDULE_TIMEZONE
) {
  return dayjs(session.startsAt).tz(timezone).format('YYYY-MM-DD');
}

export function missingDateKey(
  occurrence: WorkspaceUserGroupMissingSessionOccurrence
) {
  return occurrence.date;
}

export function compactScheduleBuckets(
  sessions: WorkspaceUserGroupSession[],
  missing: WorkspaceUserGroupMissingSessionOccurrence[] = []
) {
  const buckets = new Map<string, CompactScheduleDayBucket>();
  const ensureBucket = (date: string) => {
    const bucket = buckets.get(date) ?? { missing: [], sessions: [] };
    buckets.set(date, bucket);
    return bucket;
  };

  for (const session of sessions) {
    ensureBucket(sessionDateKey(session)).sessions.push(session);
  }

  for (const occurrence of missing) {
    ensureBucket(missingDateKey(occurrence)).missing.push(occurrence);
  }

  for (const bucket of buckets.values()) {
    bucket.sessions.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    bucket.missing.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  return buckets;
}

export function compactSessionTimeLabel(
  session:
    | WorkspaceUserGroupSession
    | WorkspaceUserGroupMissingSessionOccurrence
) {
  const startTimezone = session.startTimezone || COMPACT_SCHEDULE_TIMEZONE;
  const endTimezone = session.endTimezone || startTimezone;
  const start = dayjs(session.startsAt).tz(startTimezone).format('HH:mm');
  const end = dayjs(session.endsAt).tz(endTimezone).format('HH:mm');
  return `${start}-${end}`;
}

export function compactSessionFullTimeLabel(
  session:
    | WorkspaceUserGroupSession
    | WorkspaceUserGroupMissingSessionOccurrence
) {
  return `${compactSessionTimeLabel(session)} ${session.startTimezone}`;
}

export function upsertCompactScheduleSessions(
  data: CompactScheduleData | undefined,
  incoming: WorkspaceUserGroupSession | WorkspaceUserGroupSession[]
) {
  if (!data) return data;
  const rows = Array.isArray(incoming) ? incoming : [incoming];
  const byId = new Map(data.data.map((session) => [session.id, session]));
  for (const row of rows) byId.set(row.id, row);

  return {
    ...data,
    data: Array.from(byId.values()).sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt)
    ),
  };
}

export function optimisticCompactSchedulePatch(
  data: CompactScheduleData | undefined,
  sessionId: string,
  payload: UpdateWorkspaceUserGroupSessionPayload
) {
  if (!data) return data;

  return {
    ...data,
    data: data.data.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            endTimezone: payload.endTimezone ?? session.endTimezone,
            endsAt: payload.endsAt ?? session.endsAt,
            files:
              payload.files?.map((file, index) => ({
                id: `${session.id}-file-${index}`,
                name: file.name ?? null,
                storagePath: file.storagePath,
              })) ?? session.files,
            startTimezone: payload.startTimezone ?? session.startTimezone,
            startsAt: payload.startsAt ?? session.startsAt,
            tags:
              payload.tagNames?.map((name) => ({
                color: null,
                id: name,
                name,
              })) ?? session.tags,
            title: payload.title === undefined ? session.title : payload.title,
          }
        : session
    ),
  };
}

export function removeCompactMissingOccurrence(
  data: CompactScheduleData | undefined,
  occurrence: WorkspaceUserGroupMissingSessionOccurrence
) {
  if (!data) return data;
  return {
    ...data,
    missing: (data.missing ?? []).filter(
      (item) =>
        item.seriesId !== occurrence.seriesId || item.date !== occurrence.date
    ),
  };
}

export function compactDraftForDate(date: string): DraftSession {
  const startsAt = dayjs.tz(
    `${date} 19:00:00`,
    'YYYY-MM-DD HH:mm:ss',
    COMPACT_SCHEDULE_TIMEZONE
  );
  return {
    endsAt: startsAt.add(90, 'minute').toISOString(),
    startsAt: startsAt.toISOString(),
  };
}

export function buildMoveSessionPayload(
  session: WorkspaceUserGroupSession,
  targetDate: string
): UpdateWorkspaceUserGroupSessionPayload {
  const timezone = session.startTimezone || COMPACT_SCHEDULE_TIMEZONE;
  const localStart = dayjs(session.startsAt).tz(timezone);
  const durationMinutes = Math.max(
    dayjs(session.endsAt).diff(dayjs(session.startsAt), 'minute'),
    15
  );
  const startsAt = dayjs.tz(
    `${targetDate} ${localStart.format('HH:mm:ss')}`,
    'YYYY-MM-DD HH:mm:ss',
    timezone
  );

  return {
    endTimezone: session.endTimezone || timezone,
    endsAt: startsAt.add(durationMinutes, 'minute').toISOString(),
    files: session.files.map((file) => ({
      name: file.name,
      storagePath: file.storagePath,
    })),
    startTimezone: timezone,
    startsAt: startsAt.toISOString(),
    tagNames: session.tags.map((tag) => tag.name),
    title: session.title,
  };
}
