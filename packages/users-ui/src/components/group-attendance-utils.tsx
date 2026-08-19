import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import type {
  AttendanceEntry,
  AttendanceStatus,
} from './group-attendance-member-card';

const DEFAULT_ATTENDANCE_TIMEZONE = 'Asia/Ho_Chi_Minh';

export interface AttendanceRow {
  notes: string | null;
  session_id?: string | null;
  status: string;
  user_id: string;
}

export function buildAttendanceMap(
  rows: AttendanceRow[],
  sessionId?: string | null
) {
  const result: Record<string, AttendanceEntry> = {};
  const legacyRows = rows.filter((row) => !row.session_id);
  const selectedRows = sessionId
    ? rows.filter((row) => row.session_id === sessionId)
    : [];

  for (const row of [...legacyRows, ...selectedRows]) {
    result[row.user_id] = {
      note: row.notes || '',
      status: row.status as AttendanceStatus,
    };
  }

  return result;
}

export function getAttendanceMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function localIsoDate(date: Date, timezone: string) {
  const format = (timeZone: string) => {
    const parts = new Intl.DateTimeFormat('en', {
      day: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric',
    }).formatToParts(date);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
  };

  try {
    return format(timezone);
  } catch {
    return format(DEFAULT_ATTENDANCE_TIMEZONE);
  }
}

export function sessionAttendanceDate(session: WorkspaceUserGroupSession) {
  return localIsoDate(
    new Date(session.startsAt),
    session.startTimezone || DEFAULT_ATTENDANCE_TIMEZONE
  );
}

/**
 * Cancelled sessions remain useful as immutable attendance history once their
 * local date arrives. Future cancellations, however, are obsolete occurrences
 * left behind by a schedule change and must not appear as upcoming classes.
 */
export function filterAttendanceSessions(
  sessions: WorkspaceUserGroupSession[],
  asOf = new Date()
) {
  return sessions.filter((session) => {
    if (session.status !== 'cancelled') return true;
    const timezone = session.startTimezone || DEFAULT_ATTENDANCE_TIMEZONE;
    return sessionAttendanceDate(session) <= localIsoDate(asOf, timezone);
  });
}

export function attendanceSessionsQueryKey(
  wsId: string,
  groupId: string,
  range: { from: string; to: string }
) {
  return [
    'workspace-user-group-sessions',
    wsId,
    'attendance',
    groupId,
    range.from,
    range.to,
  ] as const;
}
