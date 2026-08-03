import type {
  AttendanceEntry,
  AttendanceStatus,
} from './group-attendance-member-card';

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
