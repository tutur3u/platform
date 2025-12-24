/**
 * Week Date Utilities
 *
 * Shared utilities for calculating week-related dates that respect
 * the user's first day of week preference.
 */

import dayjs from 'dayjs';

/**
 * Calculate days until end of week based on first day of week setting
 *
 * @param weekStartsOn - 0 = Sunday, 1 = Monday, 6 = Saturday
 * @returns Number of days until end of week (the day before weekStartsOn)
 *
 * @example
 * // If weekStartsOn = 1 (Monday), end of week = Sunday (0)
 * // If weekStartsOn = 0 (Sunday), end of week = Saturday (6)
 * // If weekStartsOn = 6 (Saturday), end of week = Friday (5)
 *
 * // On Wednesday (3), with Monday as first day:
 * // End of week = Sunday (0)
 * // Days = (0 - 3 + 7) % 7 = 4 days until Sunday
 */
export function calculateDaysUntilEndOfWeek(
  weekStartsOn: 0 | 1 | 6 = 0
): number {
  const today = dayjs();
  const currentDay = today.day(); // 0 = Sunday, 6 = Saturday

  // End of week is the day before the first day of week
  // If weekStartsOn = 1 (Monday), end of week = 0 (Sunday)
  // If weekStartsOn = 0 (Sunday), end of week = 6 (Saturday)
  // If weekStartsOn = 6 (Saturday), end of week = 5 (Friday)
  const endOfWeekDay = (weekStartsOn - 1 + 7) % 7;

  // Calculate days until end of week
  const daysUntilEnd = (endOfWeekDay - currentDay + 7) % 7;

  // If today is the end of week day, return 0 (due today, end of this week)
  return daysUntilEnd;
}

/**
 * Calculate date for "This Week" preset
 * Returns the end of the current week based on first day of week setting
 */
export function getThisWeekEndDate(weekStartsOn: 0 | 1 | 6 = 0): Date {
  return dayjs()
    .add(calculateDaysUntilEndOfWeek(weekStartsOn), 'day')
    .endOf('day')
    .toDate();
}

/**
 * Calculate date for "Next Week" preset
 * Returns the end of next week based on first day of week setting
 */
export function getNextWeekEndDate(weekStartsOn: 0 | 1 | 6 = 0): Date {
  return dayjs()
    .add(calculateDaysUntilEndOfWeek(weekStartsOn) + 7, 'day')
    .endOf('day')
    .toDate();
}
