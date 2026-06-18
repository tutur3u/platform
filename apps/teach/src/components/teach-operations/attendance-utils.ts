import type {
  TeachAttendanceDaySummary,
  TeachAttendanceEntry,
  TeachAttendanceStatus,
} from '@tuturuuu/internal-api';

export const ATTENDANCE_STATUSES = [
  'PRESENT',
  'ABSENT',
  'LATE',
] as const satisfies TeachAttendanceStatus[];

export type AttendanceEditableStatus = (typeof ATTENDANCE_STATUSES)[number];

export function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayIsoDate() {
  return toIsoDate(new Date());
}

export function addMonthsToIsoDate(value: string, months: number) {
  const date = parseIsoDate(value);
  date.setMonth(date.getMonth() + months);
  return toIsoDate(date);
}

export function dateEndUtcIso(value: string) {
  return `${value}T23:59:59.999Z`;
}

export function dateStartUtcIso(value: string) {
  return `${value}T00:00:00.000Z`;
}

export function vietnamMorningSessionIso(value: string, hour: 7 | 8) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(
    Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour - 7, 0)
  ).toISOString();
}

export function formatDateInTimezone(value: string, timezone: string) {
  let parts: Intl.DateTimeFormatPart[];

  try {
    parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: '2-digit',
      timeZone: timezone,
      year: 'numeric',
    }).formatToParts(new Date(value));
  } catch {
    return value.slice(0, 10);
  }

  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function pickInitialAttendanceDate(sessions: string[]) {
  const today = todayIsoDate();
  const sortedSessions = sessions
    .map((session) => session.slice(0, 10))
    .sort((a, b) => a.localeCompare(b));

  if (sortedSessions.includes(today)) return today;

  return (
    sortedSessions.find((session) => session > today) ??
    sortedSessions.at(-1) ??
    today
  );
}

export function toMonthKey(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

export function getCalendarGrid(monthDate: Date) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const mondayOffset = first.getDay() === 0 ? 6 : first.getDay() - 1;
  first.setDate(first.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    return day;
  });
}

export function getWeekdayIndex(date: Date) {
  return date.getDay() === 0 ? 6 : date.getDay() - 1;
}

export function isInCourseDateRange(
  date: Date,
  startingDate?: string | null,
  endingDate?: string | null
) {
  const isoDate = toIsoDate(date);
  if (startingDate && isoDate < startingDate) return false;
  if (endingDate && isoDate > endingDate) return false;
  return true;
}

export function sessionsForDate(sessions: string[], isoDate: string) {
  return sessions.filter((session) => session.startsWith(isoDate));
}

export function getAttendanceSummary(
  entries: TeachAttendanceEntry[],
  userIds: string[],
  draft: Record<string, TeachAttendanceEntry>
) {
  const byUser = new Map(entries.map((entry) => [entry.user_id, entry]));
  const summary = {
    absent: 0,
    late: 0,
    notMarked: 0,
    present: 0,
    total: userIds.length,
  };

  for (const userId of userIds) {
    const status =
      draft[userId]?.status ?? byUser.get(userId)?.status ?? 'NONE';
    if (status === 'PRESENT') summary.present += 1;
    if (status === 'ABSENT') summary.absent += 1;
    if (status === 'LATE') summary.late += 1;
    if (status === 'NONE') summary.notMarked += 1;
  }

  return summary;
}

export function inferWeekdaysFromSessions(sessions: string[]) {
  return new Set(
    sessions.map((session) =>
      getWeekdayIndex(parseIsoDate(session.slice(0, 10)))
    )
  );
}

export function toRecurrenceWeekday(weekday: number) {
  return (weekday + 1) % 7;
}

export function generateWeeklySessions({
  endingDate,
  selectedWeekdays,
  startingDate,
}: {
  endingDate: string;
  selectedWeekdays: Set<number>;
  startingDate: string;
}) {
  const sessions: string[] = [];
  const cursor = parseIsoDate(startingDate);
  const end = parseIsoDate(endingDate);

  while (cursor <= end) {
    if (selectedWeekdays.has(getWeekdayIndex(cursor))) {
      sessions.push(toIsoDate(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return sessions;
}

export function getDayTone(
  summary: TeachAttendanceDaySummary | undefined,
  scheduled: boolean,
  memberCount: number
) {
  if (!scheduled) return 'idle';
  if (!summary || summary.totalMarked === 0) return 'scheduled';
  if (summary.absent > 0) return 'absent';
  if (summary.late > 0) return 'late';
  if (memberCount > 0 && summary.totalMarked < memberCount) return 'partial';
  return 'complete';
}
