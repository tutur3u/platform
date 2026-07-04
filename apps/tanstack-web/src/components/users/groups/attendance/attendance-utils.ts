import type { WorkspaceUserGroupAttendanceRecord } from '@tuturuuu/internal-api';
import type {
  AttendanceMap,
  AttendanceSession,
  AttendanceStatus,
} from './types';

export function resolveAttendanceDate(value: string | undefined) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return new Date().toISOString().slice(0, 10);
}

export function getAttendanceSessionRange(dateYYYYMMDD: string) {
  const monthStart = new Date(`${dateYYYYMMDD}T00:00:00.000Z`);
  const rangeStart = new Date(
    monthStart.getUTCFullYear(),
    monthStart.getUTCMonth(),
    1 - 7
  );
  const rangeEnd = new Date(
    monthStart.getUTCFullYear(),
    monthStart.getUTCMonth() + 1,
    8
  );

  return { from: rangeStart.toISOString(), to: rangeEnd.toISOString() };
}

export function sessionLocalDate(session: AttendanceSession) {
  return new Date(session.startsAt).toLocaleDateString('en-CA', {
    timeZone: session.startTimezone || 'Asia/Ho_Chi_Minh',
  });
}

export function formatSessionTimeRange(
  session: AttendanceSession,
  locale: string
) {
  const startFormatter = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: session.startTimezone || 'Asia/Ho_Chi_Minh',
  });
  const endFormatter = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone:
      session.endTimezone || session.startTimezone || 'Asia/Ho_Chi_Minh',
  });

  return `${startFormatter.format(new Date(session.startsAt))} - ${endFormatter.format(new Date(session.endsAt))}`;
}

export function findValidAttendanceSessionId(
  sessions: AttendanceSession[],
  dateYYYYMMDD: string,
  sessionId?: string | null
) {
  if (!sessionId) {
    return null;
  }

  return sessions.some(
    (session) =>
      session.id === sessionId && sessionLocalDate(session) === dateYYYYMMDD
  )
    ? sessionId
    : null;
}

export function groupSessionsByDate(sessions: AttendanceSession[]) {
  const map = new Map<string, AttendanceSession[]>();

  for (const session of sessions) {
    const key = sessionLocalDate(session);
    const list = map.get(key) ?? [];
    list.push(session);
    map.set(key, list);
  }

  for (const list of map.values()) {
    list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  return map;
}

export function toAttendanceMap(
  rows: WorkspaceUserGroupAttendanceRecord[],
  activeSessionId?: string | null
): AttendanceMap {
  const map: AttendanceMap = {};
  const legacyRows: WorkspaceUserGroupAttendanceRecord[] = [];
  const sessionRows: WorkspaceUserGroupAttendanceRecord[] = [];

  for (const row of rows) {
    if (activeSessionId && row.session_id === activeSessionId) {
      sessionRows.push(row);
    } else if (!row.session_id) {
      legacyRows.push(row);
    }
  }

  for (const row of activeSessionId ? legacyRows : rows) {
    map[row.user_id] = {
      note: row.notes ?? '',
      status: row.status as AttendanceStatus,
    };
  }

  for (const row of sessionRows) {
    map[row.user_id] = {
      note: row.notes ?? '',
      status: row.status as AttendanceStatus,
    };
  }

  return map;
}
