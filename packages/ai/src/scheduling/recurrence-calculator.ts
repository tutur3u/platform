/**
 * Recurrence Calculator for Habits
 *
 * This module calculates occurrence dates for habits based on their
 * recurrence patterns (daily, weekly, monthly, yearly, custom).
 */

import type { Habit } from '@tuturuuu/types/primitives/Habit';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import utc from 'dayjs/plugin/utc';

dayjs.extend(isoWeek);
dayjs.extend(utc);

type ZonedDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
};

const DEFAULT_LOCALE = 'en-US';

function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;

  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function toUtcMinutes(parts: ZonedDateTimeParts): number {
  return Math.floor(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second ?? 0
    ) / 60000
  );
}

function getZonedDateTimeParts(date: Date, tz: string): ZonedDateTimeParts {
  const formatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value;
    return Number.parseInt(value ?? '0', 10);
  };

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function zonedDateTimeToUtc(parts: ZonedDateTimeParts, tz: string): Date {
  let guessMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0,
    0
  );

  for (let i = 0; i < 3; i++) {
    const actual = getZonedDateTimeParts(new Date(guessMs), tz);
    const diffMinutes = toUtcMinutes(parts) - toUtcMinutes(actual);
    if (diffMinutes === 0) break;
    guessMs += diffMinutes * 60_000;
  }

  return new Date(guessMs);
}

function getTimezoneSafeYmd(
  value: Date | string,
  timezone?: string | null
): { year: number; month: number; day: number } {
  if (typeof value === 'string') {
    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      return {
        year: Number.parseInt(dateOnlyMatch[1] ?? '0', 10),
        month: Number.parseInt(dateOnlyMatch[2] ?? '0', 10),
        day: Number.parseInt(dateOnlyMatch[3] ?? '0', 10),
      };
    }
  }

  if (timezone && timezone !== 'auto' && isValidTimeZone(timezone)) {
    const zoned = getZonedDateTimeParts(new Date(value), timezone);
    return {
      year: zoned.year,
      month: zoned.month,
      day: zoned.day,
    };
  }

  const parsed = dayjs(value).startOf('day');
  return {
    year: parsed.year(),
    month: parsed.month() + 1,
    day: parsed.date(),
  };
}

function toDayjsDate(
  value: Date | string,
  timezone?: string | null
): dayjs.Dayjs {
  const ymd = getTimezoneSafeYmd(value, timezone);
  return dayjs.utc(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 0, 0, 0, 0));
}

function fromDayjsDate(date: dayjs.Dayjs, timezone?: string | null): Date {
  const year = date.year();
  const month = date.month() + 1;
  const day = date.date();

  if (timezone && timezone !== 'auto' && isValidTimeZone(timezone)) {
    return zonedDateTimeToUtc(
      { year, month, day, hour: 0, minute: 0, second: 0 },
      timezone
    );
  }

  return date.toDate();
}

/**
 * Calculate the next N occurrences of a habit from a given date
 */
export function calculateOccurrences(
  habit: Habit,
  fromDate: Date,
  count: number,
  timezone?: string | null
): Date[] {
  const occurrences: Date[] = [];
  const startDate = toDayjsDate(habit.start_date, timezone);
  const endDate = habit.end_date ? toDayjsDate(habit.end_date, timezone) : null;
  let current = toDayjsDate(fromDate, timezone);

  // Ensure we start from the habit's start date if fromDate is before it
  if (current.isBefore(startDate)) {
    current = startDate.startOf('day');
  }

  // Find the first occurrence on or after current
  const firstOccurrence = findNextOccurrence(
    habit,
    current.toDate(),
    true,
    timezone
  );
  if (!firstOccurrence) return occurrences;

  let currentDayjs = toDayjsDate(firstOccurrence, timezone);

  while (occurrences.length < count) {
    // Check if we've passed the end date
    if (endDate && currentDayjs.isAfter(endDate)) {
      break;
    }

    occurrences.push(fromDayjsDate(currentDayjs, timezone));

    // Find next occurrence
    const next = findNextOccurrence(
      habit,
      currentDayjs.toDate(),
      false,
      timezone
    );
    if (!next) break;

    currentDayjs = toDayjsDate(next, timezone);
  }

  return occurrences;
}

/**
 * Get all occurrences within a date range
 */
export function getOccurrencesInRange(
  habit: Habit,
  rangeStart: Date,
  rangeEnd: Date,
  timezone?: string | null
): Date[] {
  const occurrences: Date[] = [];
  const startDate = toDayjsDate(habit.start_date, timezone);
  const endDate = habit.end_date ? toDayjsDate(habit.end_date, timezone) : null;
  const rangeEndDayjs = toDayjsDate(rangeEnd, timezone);

  let current = toDayjsDate(rangeStart, timezone);

  // Ensure we start from the habit's start date if rangeStart is before it
  if (current.isBefore(startDate)) {
    current = startDate.startOf('day');
  }

  // Find the first occurrence on or after current
  const first = findNextOccurrence(habit, current.toDate(), true, timezone);
  if (!first) return occurrences;

  let currentDayjs = toDayjsDate(first, timezone);

  while (
    currentDayjs.isBefore(rangeEndDayjs) ||
    currentDayjs.isSame(rangeEndDayjs, 'day')
  ) {
    // Check if we've passed the habit's end date
    if (endDate && currentDayjs.isAfter(endDate)) {
      break;
    }

    occurrences.push(fromDayjsDate(currentDayjs, timezone));

    // Find next occurrence
    const next = findNextOccurrence(
      habit,
      currentDayjs.toDate(),
      false,
      timezone
    );
    if (!next) break;

    currentDayjs = toDayjsDate(next, timezone);

    // Safety check to prevent infinite loops
    if (occurrences.length > 365) break;
  }

  return occurrences;
}

/**
 * Check if a specific date is an occurrence date for the habit
 */
export function isOccurrenceDate(
  habit: Habit,
  date: Date,
  timezone?: string | null
): boolean {
  const targetDate = toDayjsDate(date, timezone);
  const startDate = toDayjsDate(habit.start_date, timezone);
  const endDate = habit.end_date ? toDayjsDate(habit.end_date, timezone) : null;

  // Check bounds
  if (targetDate.isBefore(startDate)) return false;
  if (endDate && targetDate.isAfter(endDate)) return false;

  return matchesRecurrencePattern(habit, targetDate);
}

/**
 * Get the next occurrence after a given date
 * If inclusive is true, the given date is included in the search
 */
export function getNextOccurrence(
  habit: Habit,
  afterDate: Date,
  timezone?: string | null
): Date | null {
  return findNextOccurrence(habit, afterDate, false, timezone);
}

/**
 * Internal function to find the next occurrence
 */
function findNextOccurrence(
  habit: Habit,
  fromDate: Date,
  inclusive: boolean,
  timezone?: string | null
): Date | null {
  const startDate = toDayjsDate(habit.start_date, timezone);
  const endDate = habit.end_date ? toDayjsDate(habit.end_date, timezone) : null;
  let current = toDayjsDate(fromDate, timezone);

  // Start from the day after if not inclusive
  if (!inclusive) {
    current = current.add(1, 'day');
  }

  // Ensure we start from the habit's start date
  if (current.isBefore(startDate)) {
    current = startDate;
  }

  // Check if already past end date
  if (endDate && current.isAfter(endDate)) {
    return null;
  }

  // For yearly patterns, use optimized search that handles leap years
  if (habit.frequency === 'yearly') {
    return findNextYearlyOccurrence(
      habit,
      startDate,
      current,
      endDate,
      timezone
    );
  }

  // Search for up to 366 days (handles leap years for non-yearly patterns)
  const maxDaysToSearch = 366;
  for (let i = 0; i < maxDaysToSearch; i++) {
    if (matchesRecurrencePattern(habit, current)) {
      // Check end date
      if (endDate && current.isAfter(endDate)) {
        return null;
      }
      return fromDayjsDate(current, timezone);
    }
    current = current.add(1, 'day');

    // Check end date during iteration
    if (endDate && current.isAfter(endDate)) {
      return null;
    }
  }

  return null;
}

/**
 * Optimized search for yearly patterns
 * Handles leap year dates (Feb 29) correctly by jumping to candidate years
 */
function findNextYearlyOccurrence(
  habit: Habit,
  startDate: dayjs.Dayjs,
  current: dayjs.Dayjs,
  endDate: dayjs.Dayjs | null,
  timezone?: string | null
): Date | null {
  const interval = habit.recurrence_interval;
  const targetMonth = startDate.month();
  const targetDay = startDate.date();
  const isLeapYearDate = targetMonth === 1 && targetDay === 29; // Feb 29

  // Calculate the first candidate year
  let candidateYear = current.year();

  // If we're past the target date this year, start from next year
  const thisYearTarget = dayjs.utc(
    Date.UTC(candidateYear, targetMonth, targetDay, 0, 0, 0, 0)
  );

  if (current.isAfter(thisYearTarget)) {
    candidateYear++;
  }

  // Align to the interval from start year
  const startYear = startDate.year();
  const yearsDiff = candidateYear - startYear;
  if (yearsDiff < 0) {
    candidateYear = startYear;
  } else if (yearsDiff % interval !== 0) {
    // Round up to next valid interval year
    candidateYear = startYear + Math.ceil(yearsDiff / interval) * interval;
  }

  // Search up to 100 years (handles leap year dates needing to find next leap year)
  const maxYearsToSearch = 100;
  for (let i = 0; i < maxYearsToSearch; i++) {
    // For leap year dates, check if this year is a leap year
    if (isLeapYearDate) {
      if (!isLeapYear(candidateYear)) {
        candidateYear += interval;
        continue;
      }
    }

    const candidate = dayjs.utc(
      Date.UTC(candidateYear, targetMonth, targetDay, 0, 0, 0, 0)
    );

    // Verify the date is valid (handles edge cases)
    if (
      candidate.month() === targetMonth &&
      candidate.date() === targetDay &&
      !candidate.isBefore(current)
    ) {
      if (endDate && candidate.isAfter(endDate)) {
        return null;
      }
      return fromDayjsDate(candidate, timezone);
    }

    candidateYear += interval;
  }

  return null;
}

/**
 * Check if a year is a leap year
 */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Check if a date matches the habit's recurrence pattern
 */
function matchesRecurrencePattern(habit: Habit, date: dayjs.Dayjs): boolean {
  const startDate = dayjs(habit.start_date).startOf('day');
  const { frequency, recurrence_interval: interval } = habit;

  switch (frequency) {
    case 'daily':
      return matchesDailyPattern(startDate, date, interval);

    case 'weekly':
      return matchesWeeklyPattern(habit, startDate, date, interval);

    case 'monthly':
      return matchesMonthlyPattern(habit, startDate, date, interval);

    case 'yearly':
      return matchesYearlyPattern(startDate, date, interval);

    case 'custom':
      // Custom is treated as "every N days" from start
      return matchesDailyPattern(startDate, date, interval);

    default:
      return false;
  }
}

/**
 * Check if date matches daily pattern (every N days from start)
 */
function matchesDailyPattern(
  startDate: dayjs.Dayjs,
  date: dayjs.Dayjs,
  interval: number
): boolean {
  const daysDiff = date.diff(startDate, 'day');
  return daysDiff >= 0 && daysDiff % interval === 0;
}

/**
 * Check if date matches weekly pattern
 */
function matchesWeeklyPattern(
  habit: Habit,
  startDate: dayjs.Dayjs,
  date: dayjs.Dayjs,
  interval: number
): boolean {
  const { days_of_week } = habit;

  // If no specific days are set, use the same day as start date
  const targetDays =
    days_of_week && days_of_week.length > 0 ? days_of_week : [startDate.day()];

  // Check if the day of week matches
  const dayOfWeek = date.day(); // 0 = Sunday, 6 = Saturday
  if (!targetDays.includes(dayOfWeek)) {
    return false;
  }

  // Check if it's the right week (every N weeks)
  if (interval === 1) return true;

  // Calculate week difference from start
  const startWeek = startDate.startOf('week');
  const dateWeek = date.startOf('week');
  const weeksDiff = dateWeek.diff(startWeek, 'week');

  return weeksDiff >= 0 && weeksDiff % interval === 0;
}

/**
 * Check if date matches monthly pattern
 */
function matchesMonthlyPattern(
  habit: Habit,
  startDate: dayjs.Dayjs,
  date: dayjs.Dayjs,
  interval: number
): boolean {
  const { monthly_type, day_of_month, week_of_month, day_of_week_monthly } =
    habit;

  // Check month interval
  const monthsDiff = getMonthsDiff(startDate, date);
  if (monthsDiff < 0 || monthsDiff % interval !== 0) {
    return false;
  }

  if (monthly_type === 'day_of_month') {
    // Match specific day of month (e.g., 15th)
    const targetDay = day_of_month ?? startDate.date();
    return matchesDayOfMonth(date, targetDay);
  } else if (monthly_type === 'day_of_week') {
    // Match nth weekday of month (e.g., 2nd Tuesday)
    const targetWeek = week_of_month ?? 1;
    const targetDayOfWeek = day_of_week_monthly ?? startDate.day();
    return matchesNthWeekday(date, targetWeek, targetDayOfWeek);
  }

  // Default: same day as start date
  return date.date() === startDate.date();
}

/**
 * Check if date matches yearly pattern
 */
function matchesYearlyPattern(
  startDate: dayjs.Dayjs,
  date: dayjs.Dayjs,
  interval: number
): boolean {
  // Must be same month and day
  if (date.month() !== startDate.month() || date.date() !== startDate.date()) {
    return false;
  }

  // Check year interval
  const yearsDiff = date.year() - startDate.year();
  return yearsDiff >= 0 && yearsDiff % interval === 0;
}

/**
 * Get the number of months between two dates
 */
function getMonthsDiff(start: dayjs.Dayjs, end: dayjs.Dayjs): number {
  return (end.year() - start.year()) * 12 + (end.month() - start.month());
}

/**
 * Check if a date matches a specific day of month
 * Handles edge cases like Feb 30 -> Feb 28/29
 */
function matchesDayOfMonth(date: dayjs.Dayjs, targetDay: number): boolean {
  const lastDayOfMonth = date.endOf('month').date();
  const actualTargetDay = Math.min(targetDay, lastDayOfMonth);
  return date.date() === actualTargetDay;
}

/**
 * Check if a date is the nth weekday of its month
 * @param week - 1-4 for first through fourth, 5 for "last"
 * @param dayOfWeek - 0 (Sunday) through 6 (Saturday)
 */
function matchesNthWeekday(
  date: dayjs.Dayjs,
  week: number,
  dayOfWeek: number
): boolean {
  // Check if it's the right day of week
  if (date.day() !== dayOfWeek) {
    return false;
  }

  if (week === 5) {
    // "Last" weekday of month
    // Check if adding 7 days would go to next month
    return date.add(7, 'day').month() !== date.month();
  }

  // Check if it's the nth occurrence
  const dayOfMonth = date.date();
  const weekOfMonth = Math.ceil(dayOfMonth / 7);
  return weekOfMonth === week;
}

/**
 * Get a human-readable description of when the next occurrence is
 */
export function getNextOccurrenceDescription(
  habit: Habit,
  fromDate: Date = new Date(),
  timezone?: string | null
): string {
  const next = getNextOccurrence(habit, fromDate, timezone);
  if (!next) return 'No more occurrences';

  const nextDayjs = toDayjsDate(next, timezone);
  const today = toDayjsDate(fromDate, timezone);
  const diff = nextDayjs.diff(today, 'day');

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7) return nextDayjs.format('dddd'); // Day name
  return nextDayjs.format('MMM D'); // e.g., "Jan 15"
}
