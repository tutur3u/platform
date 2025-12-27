/**
 * Recurrence Calculator for Habits
 *
 * This module calculates occurrence dates for habits based on their
 * recurrence patterns (daily, weekly, monthly, yearly, custom).
 */

import type { Habit } from '@tuturuuu/types/primitives/Habit';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

/**
 * Calculate the next N occurrences of a habit from a given date
 */
export function calculateOccurrences(
  habit: Habit,
  fromDate: Date,
  count: number
): Date[] {
  const occurrences: Date[] = [];
  const startDate = dayjs(habit.start_date);
  const endDate = habit.end_date ? dayjs(habit.end_date) : null;
  let current = dayjs(fromDate).startOf('day');

  // Ensure we start from the habit's start date if fromDate is before it
  if (current.isBefore(startDate)) {
    current = startDate.startOf('day');
  }

  // Find the first occurrence on or after current
  const firstOccurrence = findNextOccurrence(habit, current.toDate(), true);
  if (!firstOccurrence) return occurrences;

  let currentDayjs = dayjs(firstOccurrence);

  while (occurrences.length < count) {
    // Check if we've passed the end date
    if (endDate && currentDayjs.isAfter(endDate)) {
      break;
    }

    occurrences.push(currentDayjs.toDate());

    // Find next occurrence
    const next = findNextOccurrence(habit, currentDayjs.toDate(), false);
    if (!next) break;

    currentDayjs = dayjs(next);
  }

  return occurrences;
}

/**
 * Get all occurrences within a date range
 */
export function getOccurrencesInRange(
  habit: Habit,
  rangeStart: Date,
  rangeEnd: Date
): Date[] {
  const occurrences: Date[] = [];
  const startDate = dayjs(habit.start_date);
  const endDate = habit.end_date ? dayjs(habit.end_date) : null;
  const rangeEndDayjs = dayjs(rangeEnd);

  let current = dayjs(rangeStart).startOf('day');

  // Ensure we start from the habit's start date if rangeStart is before it
  if (current.isBefore(startDate)) {
    current = startDate.startOf('day');
  }

  // Find the first occurrence on or after current
  const first = findNextOccurrence(habit, current.toDate(), true);
  if (!first) return occurrences;

  let currentDayjs = dayjs(first);

  while (
    currentDayjs.isBefore(rangeEndDayjs) ||
    currentDayjs.isSame(rangeEndDayjs, 'day')
  ) {
    // Check if we've passed the habit's end date
    if (endDate && currentDayjs.isAfter(endDate)) {
      break;
    }

    occurrences.push(currentDayjs.toDate());

    // Find next occurrence
    const next = findNextOccurrence(habit, currentDayjs.toDate(), false);
    if (!next) break;

    currentDayjs = dayjs(next);

    // Safety check to prevent infinite loops
    if (occurrences.length > 365) break;
  }

  return occurrences;
}

/**
 * Check if a specific date is an occurrence date for the habit
 */
export function isOccurrenceDate(habit: Habit, date: Date): boolean {
  const targetDate = dayjs(date).startOf('day');
  const startDate = dayjs(habit.start_date).startOf('day');
  const endDate = habit.end_date ? dayjs(habit.end_date).startOf('day') : null;

  // Check bounds
  if (targetDate.isBefore(startDate)) return false;
  if (endDate && targetDate.isAfter(endDate)) return false;

  return matchesRecurrencePattern(habit, targetDate);
}

/**
 * Get the next occurrence after a given date
 * If inclusive is true, the given date is included in the search
 */
export function getNextOccurrence(habit: Habit, afterDate: Date): Date | null {
  return findNextOccurrence(habit, afterDate, false);
}

/**
 * Internal function to find the next occurrence
 */
function findNextOccurrence(
  habit: Habit,
  fromDate: Date,
  inclusive: boolean
): Date | null {
  const startDate = dayjs(habit.start_date).startOf('day');
  const endDate = habit.end_date ? dayjs(habit.end_date).startOf('day') : null;
  let current = dayjs(fromDate).startOf('day');

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
    return findNextYearlyOccurrence(habit, startDate, current, endDate);
  }

  // Search for up to 366 days (handles leap years for non-yearly patterns)
  const maxDaysToSearch = 366;
  for (let i = 0; i < maxDaysToSearch; i++) {
    if (matchesRecurrencePattern(habit, current)) {
      // Check end date
      if (endDate && current.isAfter(endDate)) {
        return null;
      }
      return current.toDate();
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
  endDate: dayjs.Dayjs | null
): Date | null {
  const interval = habit.recurrence_interval;
  const targetMonth = startDate.month();
  const targetDay = startDate.date();
  const isLeapYearDate = targetMonth === 1 && targetDay === 29; // Feb 29

  // Calculate the first candidate year
  let candidateYear = current.year();

  // If we're past the target date this year, start from next year
  const thisYearTarget = dayjs()
    .year(candidateYear)
    .month(targetMonth)
    .date(targetDay)
    .startOf('day');

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

    const candidate = dayjs()
      .year(candidateYear)
      .month(targetMonth)
      .date(targetDay)
      .startOf('day');

    // Verify the date is valid (handles edge cases)
    if (
      candidate.month() === targetMonth &&
      candidate.date() === targetDay &&
      !candidate.isBefore(current)
    ) {
      if (endDate && candidate.isAfter(endDate)) {
        return null;
      }
      return candidate.toDate();
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
  fromDate: Date = new Date()
): string {
  const next = getNextOccurrence(habit, fromDate);
  if (!next) return 'No more occurrences';

  const nextDayjs = dayjs(next);
  const today = dayjs(fromDate).startOf('day');
  const diff = nextDayjs.diff(today, 'day');

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7) return nextDayjs.format('dddd'); // Day name
  return nextDayjs.format('MMM D'); // e.g., "Jan 15"
}
