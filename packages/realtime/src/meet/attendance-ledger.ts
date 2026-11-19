import { spreadsheetCsvCell } from './csv-cell';

export const ATTENDANCE_INTERVAL_CAP = 4096;

export type AttendanceKind = 'member' | 'guest';

export type AttendanceInterval = {
  sourceKey: string;
  deviceUserId: string;
  kind: AttendanceKind;
  userId?: string;
  guestId?: string;
  displayName: string;
  joinedAt: string;
  leftAt?: string;
};

export const ATTENDANCE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const ATTENDANCE_PAGE_SIZE = 1000;

/** Exported attendance. Account and guest ids stay in storage and are not included. */
export type AttendanceRow = {
  name: string;
  firstJoin: string;
  totalMinutes: number;
  kind: AttendanceKind;
};

export function attendanceIdentity(input: {
  guest?: boolean;
  participantKind?: AttendanceKind;
  accountId?: string;
  userId: string;
  displayName?: string;
}) {
  const kind = input.participantKind ?? (input.guest ? 'guest' : 'member');
  const id = input.accountId ?? input.userId;
  const displayName = (input.displayName?.trim() || 'Participant').slice(
    0,
    120
  );
  return kind === 'guest'
    ? { kind, guestId: id, displayName }
    : { kind, userId: id, displayName };
}

function sameIntervals(
  current: AttendanceInterval[] | undefined,
  next: AttendanceInterval[] | undefined
) {
  return next === current;
}

export function openAttendanceInterval(
  intervals: AttendanceInterval[] | undefined,
  input: {
    deviceUserId: string;
    kind: AttendanceKind;
    userId?: string;
    guestId?: string;
    displayName: string;
    joinedAt: string;
  }
): AttendanceInterval[] | undefined {
  const list = intervals ?? [];
  const open = list.find(
    (row) => row.deviceUserId === input.deviceUserId && !row.leftAt
  );
  if (open) {
    if (open.displayName === input.displayName) return intervals;
    return list.map((row) =>
      row === open ? { ...row, displayName: input.displayName } : row
    );
  }
  const sourceKey = `${input.deviceUserId}:${input.joinedAt}`.slice(0, 200);
  if (list.some((row) => row.sourceKey === sourceKey)) return intervals;
  if (list.length >= ATTENDANCE_INTERVAL_CAP) return intervals ?? [];
  return [
    ...list,
    {
      sourceKey,
      deviceUserId: input.deviceUserId,
      kind: input.kind,
      displayName: input.displayName.slice(0, 120),
      joinedAt: input.joinedAt,
      ...(input.kind === 'member'
        ? { userId: input.userId }
        : { guestId: input.guestId }),
    },
  ];
}

export function renameOpenAttendance(
  intervals: AttendanceInterval[] | undefined,
  deviceUserId: string,
  displayName: string
) {
  const open = intervals?.find(
    (row) => row.deviceUserId === deviceUserId && !row.leftAt
  );
  if (!open || open.displayName === displayName) return intervals;
  return intervals!.map((row) =>
    row === open ? { ...row, displayName } : row
  );
}

export function closeAttendanceInterval(
  intervals: AttendanceInterval[] | undefined,
  deviceUserId: string,
  now: string
) {
  if (
    !intervals?.some((row) => row.deviceUserId === deviceUserId && !row.leftAt)
  )
    return intervals;
  return intervals.map((row) =>
    row.deviceUserId === deviceUserId && !row.leftAt
      ? { ...row, leftAt: now }
      : row
  );
}

export function attendancePatch<
  T extends { attendance?: AttendanceInterval[] },
>(state: T, intervals: AttendanceInterval[] | undefined): Partial<T> {
  if (sameIntervals(state.attendance, intervals)) return {};
  return { attendance: intervals ?? [] } as Partial<T>;
}

export function aggregateAttendance(
  intervals: AttendanceInterval[],
  now: string,
  roomEndedAt?: string
): AttendanceRow[] {
  const groups = new Map<string, AttendanceInterval[]>();
  for (const row of intervals) {
    const id = row.kind === 'guest' ? row.guestId : row.userId;
    if (!id) continue;
    const key = `${row.kind}:${id}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const nowMs = Date.parse(now);
  const endedMs =
    roomEndedAt === undefined ? undefined : Date.parse(roomEndedAt);
  const openCap =
    endedMs !== undefined && Number.isFinite(endedMs)
      ? Math.min(nowMs, endedMs)
      : nowMs;
  return [...groups.entries()]
    .map(([key, list]) => {
      const kind: AttendanceKind = key.startsWith('guest:')
        ? 'guest'
        : 'member';
      const sorted = [...list].sort((a, b) =>
        a.joinedAt.localeCompare(b.joinedAt)
      );
      const spans = sorted
        .map((row) => ({
          start: Date.parse(row.joinedAt),
          end: row.leftAt ? Date.parse(row.leftAt) : openCap,
        }))
        .filter(
          (span) =>
            Number.isFinite(span.start) &&
            Number.isFinite(span.end) &&
            span.end >= span.start
        )
        .sort((a, b) => a.start - b.start);
      let total = 0;
      let cursor = Number.NaN;
      let end = Number.NaN;
      for (const span of spans) {
        if (!Number.isFinite(cursor) || span.start > end) {
          if (Number.isFinite(cursor)) total += end - cursor;
          cursor = span.start;
          end = span.end;
        } else {
          end = Math.max(end, span.end);
        }
      }
      if (Number.isFinite(cursor)) total += end - cursor;
      return {
        name: sorted.at(-1)?.displayName ?? 'Participant',
        firstJoin: sorted[0]?.joinedAt ?? new Date(nowMs).toISOString(),
        totalMinutes: Math.round(total / 60_000),
        kind,
      };
    })
    .sort(
      (a, b) =>
        a.firstJoin.localeCompare(b.firstJoin) || a.name.localeCompare(b.name)
    );
}

export function closeOpenAttendanceIntervals(
  intervals: AttendanceInterval[] | undefined,
  now: string
) {
  if (!intervals?.some((row) => !row.leftAt)) return intervals;
  return intervals.map((row) => (row.leftAt ? row : { ...row, leftAt: now }));
}

/** Closes every open interval once collection is off. Room end closes them too. */
export function closeAttendanceWhenCollectionStops(
  intervals: AttendanceInterval[] | undefined,
  collecting: boolean,
  now: string
) {
  if (collecting) return intervals;
  return closeOpenAttendanceIntervals(intervals, now);
}

export function nextAttendanceAlarm(
  intervals: AttendanceInterval[] | undefined,
  nowMs: number
) {
  if (!intervals?.length || !Number.isFinite(nowMs)) return undefined;
  let earliest = Number.POSITIVE_INFINITY;
  for (const row of intervals) {
    const joined = Date.parse(row.joinedAt);
    if (!Number.isFinite(joined)) continue;
    earliest = Math.min(earliest, joined + ATTENDANCE_RETENTION_MS);
  }
  if (!Number.isFinite(earliest) || earliest <= nowMs) return undefined;
  return earliest;
}

export function maintainAttendanceCopy(
  intervals: AttendanceInterval[] | undefined,
  collecting: boolean,
  now: string
) {
  return expireAttendanceIntervals(
    closeAttendanceWhenCollectionStops(intervals, collecting, now),
    now
  );
}

export function expireAttendanceIntervals(
  intervals: AttendanceInterval[] | undefined,
  now: string
) {
  if (!intervals?.length) return intervals;
  const cutoff = Date.parse(now) - ATTENDANCE_RETENTION_MS;
  const next = intervals.filter((row) => Date.parse(row.joinedAt) >= cutoff);
  return next.length === intervals.length ? intervals : next;
}

export function eraseAttendanceCopy(
  intervals: AttendanceInterval[] | undefined,
  target: { all?: boolean; userId?: string; guestId?: string }
) {
  if (!intervals?.length) return intervals;
  if (target.all) return [];
  const next = intervals.filter((row) => {
    if (target.userId && row.userId === target.userId) return false;
    if (target.guestId && row.guestId === target.guestId) return false;
    return true;
  });
  return next.length === intervals.length ? intervals : next;
}

export function attendanceCsv(rows: AttendanceRow[]) {
  const header = 'name,first_join,total_minutes,kind';
  const lines = rows.map((row) =>
    [row.name, row.firstJoin, String(row.totalMinutes), row.kind]
      .map(spreadsheetCsvCell)
      .join(',')
  );
  return [header, ...lines].join('\n');
}
