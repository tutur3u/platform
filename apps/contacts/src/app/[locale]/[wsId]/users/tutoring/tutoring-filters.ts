import type { TutoringSessionRecord } from '@tuturuuu/internal-api';
import type { ListTutoringSessionsParams } from '@tuturuuu/internal-api/tutoring';

export const TUTORING_DATE_RANGES = [
  'upcoming',
  'today',
  'week',
  'month',
  'past',
  'all',
] as const;

export type TutoringDateRange = (typeof TUTORING_DATE_RANGES)[number];

export interface TutoringDateBounds {
  fromDate?: string;
  toDate?: string;
}

export function isTutoringDateRange(
  value: string | null | undefined
): value is TutoringDateRange {
  return TUTORING_DATE_RANGES.includes(value as TutoringDateRange);
}

/** Local calendar date as `YYYY-MM-DD`, never the UTC-shifted ISO date. */
export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(isoDate: string) {
  const [year, month, day] = isoDate
    .split('-')
    .map((part) => Number.parseInt(part, 10));

  if (!(year && month && day)) return null;

  return new Date(year, month - 1, day);
}

export function addDaysToIsoDate(isoDate: string, days: number) {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return isoDate;

  parsed.setDate(parsed.getDate() + days);
  return toIsoDate(parsed);
}

export function startOfMonthIsoDate(isoDate: string) {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return isoDate;

  return toIsoDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
}

export function endOfMonthIsoDate(isoDate: string) {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return isoDate;

  return toIsoDate(new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0));
}

/**
 * The sessions API has always accepted `fromDate`/`toDate`, but the page never
 * sent them, so every workspace paged through its entire history to find this
 * week's sessions. Presets turn that into one bounded query.
 */
export function resolveTutoringDateBounds(
  range: TutoringDateRange,
  today: string
): TutoringDateBounds {
  switch (range) {
    case 'today':
      return { fromDate: today, toDate: today };
    case 'upcoming':
      return { fromDate: today };
    case 'week':
      return { fromDate: today, toDate: addDaysToIsoDate(today, 6) };
    case 'month':
      return {
        fromDate: startOfMonthIsoDate(today),
        toDate: endOfMonthIsoDate(today),
      };
    case 'past':
      return { toDate: addDaysToIsoDate(today, -1) };
    default:
      return {};
  }
}

export interface TutoringSessionFilters {
  attendanceStatus: string;
  dateRange: TutoringDateRange;
  groupId: string;
  reasonType: string;
  studentUserId: string;
  teacherUserId: string;
}

export const DEFAULT_SESSION_FILTERS: TutoringSessionFilters = {
  attendanceStatus: 'all',
  dateRange: 'upcoming',
  groupId: 'all',
  reasonType: 'all',
  studentUserId: 'all',
  teacherUserId: 'all',
};

function optional(value: string) {
  return value === 'all' ? undefined : value;
}

/**
 * Forward-looking ranges read chronologically (the next session first); history
 * and the unbounded list keep the API's newest-first default.
 */
export function resolveTutoringSortOrder(
  range: TutoringDateRange
): 'asc' | 'desc' {
  return range === 'past' || range === 'all' ? 'desc' : 'asc';
}

export function buildTutoringSessionQuery(
  filters: TutoringSessionFilters,
  today: string
): ListTutoringSessionsParams {
  return {
    ...resolveTutoringDateBounds(filters.dateRange, today),
    sortOrder: resolveTutoringSortOrder(filters.dateRange),
    attendanceStatus: optional(
      filters.attendanceStatus
    ) as ListTutoringSessionsParams['attendanceStatus'],
    groupId: optional(filters.groupId),
    reasonType: optional(
      filters.reasonType
    ) as ListTutoringSessionsParams['reasonType'],
    studentUserId: optional(filters.studentUserId),
    teacherId: optional(filters.teacherUserId),
  };
}

export function countActiveTutoringFilters(filters: TutoringSessionFilters) {
  return [
    filters.attendanceStatus,
    filters.groupId,
    filters.reasonType,
    filters.studentUserId,
    filters.teacherUserId,
  ].filter((value) => value !== 'all').length;
}

export function isTutoringSessionFiltered(filters: TutoringSessionFilters) {
  return (
    countActiveTutoringFilters(filters) > 0 ||
    filters.dateRange !== DEFAULT_SESSION_FILTERS.dateRange
  );
}

export const TUTORING_STAT_KEYS = [
  'today',
  'pending',
  'completed',
  'missed',
] as const;

export type TutoringStatKey = (typeof TUTORING_STAT_KEYS)[number];

/**
 * Each stat is one bounded `count: exact` list request with `pageSize: 1`, so
 * the header stays accurate on workspaces with more sessions than a page.
 */
export function buildTutoringStatQuery(
  key: TutoringStatKey,
  today: string
): ListTutoringSessionsParams {
  const last30Days = { fromDate: addDaysToIsoDate(today, -29), toDate: today };

  switch (key) {
    case 'today':
      return { fromDate: today, toDate: today };
    case 'pending':
      return { attendanceStatus: 'PENDING', fromDate: today };
    case 'completed':
      return { ...last30Days, attendanceStatus: 'DONE' };
    default:
      return { ...last30Days, attendanceStatus: 'NO_SHOW' };
  }
}

/** Sessions grouped by calendar day, keeping the order the API returned. */
export function groupSessionsByDate(sessions: TutoringSessionRecord[]) {
  const groups = new Map<string, TutoringSessionRecord[]>();

  for (const session of sessions) {
    const bucket = groups.get(session.session_date);
    if (bucket) {
      bucket.push(session);
      continue;
    }
    groups.set(session.session_date, [session]);
  }

  return [...groups.entries()].map(([date, items]) => ({ date, items }));
}

export function formatSessionTimeRange(
  startTime: string,
  durationMinutes: number
) {
  const [rawHour = '0', rawMinute = '0'] = String(startTime).split(':');
  const hour = Number.parseInt(rawHour, 10);
  const minute = Number.parseInt(rawMinute, 10);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return String(startTime).slice(0, 5);
  }

  const start = hour * 60 + minute;
  const end = start + Math.max(0, durationMinutes);
  const format = (totalMinutes: number) => {
    const normalized = ((totalMinutes % 1440) + 1440) % 1440;
    const hours = `${Math.floor(normalized / 60)}`.padStart(2, '0');
    const minutes = `${normalized % 60}`.padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return `${format(start)} – ${format(end)}`;
}
