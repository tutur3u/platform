import { getTimeFormatPattern } from '@tuturuuu/utils/time-helper';
import {
  format,
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
  type Locale,
} from 'date-fns';

/**
 * Smart date formatting that uses relative dates for today/tomorrow/yesterday
 */
export function formatSmartDate(
  date: Date,
  translations?: {
    today?: string;
    tomorrow?: string;
    yesterday?: string;
  },
  locale?: Locale
): string {
  if (isToday(date)) return translations?.today ?? 'Today';
  if (isTomorrow(date)) return translations?.tomorrow ?? 'Tomorrow';
  if (isYesterday(date)) return translations?.yesterday ?? 'Yesterday';
  return formatDistanceToNow(date, { addSuffix: true, locale });
}

/**
 * Format date with time
 * @param date - The date to format
 * @param timeFormat - The time format preference ('12h' or '24h')
 */
export function formatDateWithTime(
  date: Date,
  timeFormat: '12h' | '24h' = '12h'
): string {
  const timePattern = getTimeFormatPattern(timeFormat);
  return format(date, `MMM dd 'at' ${timePattern}`);
}

/**
 * Check if a date is overdue (past current time)
 */
export function isOverdue(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  return new Date(date) < new Date();
}

/**
 * Check if a date is in the future
 */
export function isFutureDate(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  return new Date(date) > new Date();
}

/**
 * Get relative time display (for lightweight cards)
 */
export function getRelativeTimeDisplay(
  date: Date | string | null | undefined
): string | null {
  if (!date) return null;
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

/**
 * Parse date string safely
 */
export function parseDateSafely(
  date: string | Date | null | undefined
): Date | null {
  if (!date) return null;
  try {
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}
