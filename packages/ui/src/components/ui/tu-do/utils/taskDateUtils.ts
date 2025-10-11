import {
  format,
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
} from 'date-fns';

/**
 * Smart date formatting that uses relative dates for today/tomorrow/yesterday
 */
export function formatSmartDate(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isYesterday(date)) return 'Yesterday';
  return formatDistanceToNow(date, { addSuffix: true });
}

/**
 * Format date with time
 */
export function formatDateWithTime(date: Date): string {
  return format(date, "MMM dd 'at' h:mm a");
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
