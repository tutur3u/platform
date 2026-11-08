/**
 * Pure helpers for the monthly GVNN (foreign teacher) schedule.
 *
 * A schedule session is a draft topic announcement with a class, a local date
 * and a start/end time. Dates are calendar dates (`YYYY-MM-DD`) and times are
 * wall-clock `HH:MM` in the workspace timezone, so every helper here works on
 * plain strings and UTC date arithmetic with no timezone conversion.
 */

/** Default GVNN period length; the end time defaults to start + 30 min. */
export const TOPIC_SCHEDULE_DEFAULT_DURATION_MINUTES = 30;
export const TOPIC_SCHEDULE_MIN_DURATION_MINUTES = 5;
export const TOPIC_SCHEDULE_MAX_DURATION_MINUTES = 240;

/** Contact tag that lists a contact in the GVNN picker (case-insensitive). */
export const TOPIC_SCHEDULE_GVNN_TAG = 'GVNN';

/** Group membership role whose member is the class's GVCN (homeroom). */
export const TOPIC_SCHEDULE_GVCN_ROLE = 'TEACHER';

/** One schedule session as the API returns it. Times are `HH:MM`. */
export interface ScheduleSession {
  classLabel: string | null;
  /** Minutes from start to end; null when the end time is missing. */
  durationMinutes: number | null;
  endTime: string | null;
  groupId: string | null;
  /** The GVNN contact; null while the session still needs one. */
  gvnnContactId: string | null;
  hasTopic: boolean;
  id: string;
  place: string | null;
  room: string | null;
  sentAt: string | null;
  sessionDate: string;
  startTime: string;
  status: string;
  /** The class's GVCN at save time; null when the class has no teacher. */
  teacherWorkspaceUserId: string | null;
}

export interface ScheduleClassTeacher {
  id: string;
  name: string;
}

export interface ScheduleClass {
  id: string;
  name: string;
  /** Auto-assigned GVCN; see pickPrimaryGroupTeacher. */
  primaryTeacherId: string | null;
  teachers: ScheduleClassTeacher[];
}

export interface ScheduleGvnnContact {
  email: string;
  id: string;
  name: string;
}

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/u;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/u;

export function isGvnnContactTags(tags: readonly string[] | null | undefined) {
  return (tags ?? []).some(
    (tag) => tag.trim().toUpperCase() === TOPIC_SCHEDULE_GVNN_TAG
  );
}

export function isScheduleMonth(value: string) {
  return MONTH_PATTERN.test(value);
}

function parseMonth(month: string) {
  const match = month.match(MONTH_PATTERN);
  if (!match) throw new Error(`Invalid schedule month: ${month}`);
  return { month: Number(match[2]), year: Number(match[1]) };
}

function parseDate(date: string) {
  const match = date.match(DATE_PATTERN);
  if (!match) throw new Error(`Invalid schedule date: ${date}`);
  const [, year, month, day] = match.map(Number) as [
    number,
    number,
    number,
    number,
  ];
  const value = new Date(Date.UTC(year, month - 1, day));
  if (value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) {
    throw new Error(`Invalid schedule date: ${date}`);
  }
  return value;
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function isScheduleDate(value: string) {
  try {
    parseDate(value);
    return true;
  } catch {
    return false;
  }
}

export function daysInScheduleMonth(month: string) {
  const { month: monthNumber, year } = parseMonth(month);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

/** First and last calendar date of a `YYYY-MM` month. */
export function scheduleMonthRange(month: string) {
  parseMonth(month);
  return {
    end: `${month}-${String(daysInScheduleMonth(month)).padStart(2, '0')}`,
    start: `${month}-01`,
  };
}

export function shiftScheduleMonth(month: string, delta: number) {
  const { month: monthNumber, year } = parseMonth(month);
  const value = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return formatDate(value).slice(0, 7);
}

export function scheduleDateMonth(date: string) {
  return formatDate(parseDate(date)).slice(0, 7);
}

/** 0 = Sunday ... 6 = Saturday. */
export function scheduleWeekday(date: string) {
  return parseDate(date).getUTCDay();
}

/** 1-based occurrence of the date's weekday within its month (1..5). */
export function scheduleWeekdayOccurrence(date: string) {
  return Math.ceil(parseDate(date).getUTCDate() / 7);
}

/**
 * Maps a date onto the same nth weekday of the target month: the 2nd Tuesday
 * of October becomes the 2nd Tuesday of November. Returns null when the
 * target month has no such occurrence (a 5th weekday the month lacks), so
 * the caller can surface it instead of guessing another date.
 */
export function mapToSameNthWeekday(date: string, targetMonth: string) {
  const weekday = scheduleWeekday(date);
  const occurrence = scheduleWeekdayOccurrence(date);
  const { month, year } = parseMonth(targetMonth);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (occurrence - 1) * 7;
  if (day > daysInScheduleMonth(targetMonth)) return null;
  return `${targetMonth}-${String(day).padStart(2, '0')}`;
}

/** Normalizes `H:MM`, `HH:MM` or `HH:MM:SS` to `HH:MM`; null if invalid. */
export function normalizeScheduleTime(value: string | null | undefined) {
  const match = value?.trim().match(TIME_PATTERN);
  if (!match) return null;
  return `${match[1]!.padStart(2, '0')}:${match[2]}`;
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

/** Adds minutes to a wall-clock time; null if it would pass midnight. */
export function addMinutesToScheduleTime(time: string, minutes: number) {
  const normalized = normalizeScheduleTime(time);
  if (!normalized || !Number.isInteger(minutes) || minutes < 0) return null;
  const total = toMinutes(normalized) + minutes;
  if (total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(
    total % 60
  ).padStart(2, '0')}`;
}

/** Minutes from start to end on the same day; null if invalid or not after. */
export function scheduleDurationMinutes(
  startTime: string | null | undefined,
  endTime: string | null | undefined
) {
  const start = normalizeScheduleTime(startTime);
  const end = normalizeScheduleTime(endTime);
  if (!start || !end) return null;
  const minutes = toMinutes(end) - toMinutes(start);
  return minutes > 0 ? minutes : null;
}

/**
 * Identity of a schedule slot: one class cannot have two GVNN sessions that
 * start at the same date and time. Used to keep clones and retries
 * idempotent without a database unique key.
 */
export function scheduleSlotKey(slot: {
  groupId: string | null;
  sessionDate: string | null;
  startTime: string | null;
}) {
  return [
    slot.groupId ?? '',
    slot.sessionDate ?? '',
    normalizeScheduleTime(slot.startTime) ?? '',
  ].join('|');
}

export interface ScheduleGroupTeacherMember {
  createdAt: string | null;
  userId: string;
}

/**
 * The class's GVCN when it has several TEACHER members: the earliest
 * assigned (membership `created_at`, unknown last), then the lowest id, so
 * the choice is stable across loads. Every TEACHER of the class keeps topic
 * access through the group rule; this only picks who is notified.
 */
export function pickPrimaryGroupTeacher(
  members: readonly ScheduleGroupTeacherMember[]
) {
  const sorted = [...members].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      if (left.createdAt === null) return 1;
      if (right.createdAt === null) return -1;
      return left.createdAt < right.createdAt ? -1 : 1;
    }
    return left.userId < right.userId ? -1 : left.userId > right.userId ? 1 : 0;
  });
  return sorted[0]?.userId ?? null;
}
