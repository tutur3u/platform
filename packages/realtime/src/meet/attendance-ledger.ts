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

export type AttendanceRow = {
  name: string;
  firstJoin: string;
  totalMinutes: number;
  kind: AttendanceKind;
  userId?: string;
  guestId?: string;
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
  now: string
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
  return [...groups.entries()]
    .map(([key, list]) => {
      const kind: AttendanceKind = key.startsWith('guest:')
        ? 'guest'
        : 'member';
      const id = key.slice(kind.length + 1);
      const sorted = [...list].sort((a, b) =>
        a.joinedAt.localeCompare(b.joinedAt)
      );
      const spans = sorted
        .map((row) => ({
          start: Date.parse(row.joinedAt),
          end: Date.parse(row.leftAt ?? now),
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
        ...(kind === 'member' ? { userId: id } : { guestId: id }),
      };
    })
    .sort(
      (a, b) =>
        a.firstJoin.localeCompare(b.firstJoin) || a.name.localeCompare(b.name)
    );
}

function csvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function attendanceCsv(rows: AttendanceRow[]) {
  const header = 'name,first_join,total_minutes,kind,user_id,guest_id';
  const lines = rows.map((row) =>
    [
      row.name,
      row.firstJoin,
      String(row.totalMinutes),
      row.kind,
      row.userId ?? '',
      row.guestId ?? '',
    ]
      .map(csvCell)
      .join(',')
  );
  return [header, ...lines].join('\n');
}
