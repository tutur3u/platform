import { format as dateFnsFormat } from 'date-fns';

export type TimeFormat = '12h' | '24h';

/**
 * Format a Date object's time according to the user's time format preference
 * @param date - The date to format
 * @param format - '12h' for AM/PM format (1:30 PM) or '24h' for 24-hour format (13:30)
 * @returns Formatted time string
 */
export function formatTimeByPreference(
  date: Date,
  format: TimeFormat = '12h'
): string {
  return format === '24h'
    ? dateFnsFormat(date, 'HH:mm')
    : dateFnsFormat(date, 'h:mm a');
}

/**
 * Get the date-fns format pattern for the given time format preference
 * @param format - '12h' for AM/PM format or '24h' for 24-hour format
 * @returns The date-fns format pattern string
 */
export function getTimeFormatPattern(format: TimeFormat = '12h'): string {
  return format === '24h' ? 'HH:mm' : 'h:mm a';
}

/**
 * Get the date-fns format pattern for date with time according to preference
 * @param format - '12h' for AM/PM format or '24h' for 24-hour format
 * @param datePattern - The date portion pattern (default: 'MMM d, yyyy')
 * @returns The combined date-fns format pattern string
 */
export function getDateTimeFormatPattern(
  format: TimeFormat = '12h',
  datePattern: string = 'MMM d, yyyy'
): string {
  const timePattern = getTimeFormatPattern(format);
  return `${datePattern} ${timePattern}`;
}

// Utility function to parse time from timetz format (e.g., "09:00:00+00")
// Converts hour 0 to 24 to support 1-24 hour format used in the application
export const parseTimeFromTimetz = (
  timetz: string | undefined
): number | undefined => {
  if (!timetz) return undefined;

  // Validate basic format before splitting
  if (!timetz.includes(':')) return undefined;

  const timePart = timetz.split(':')[0];
  if (!timePart) return undefined;

  const hour = parseInt(timePart, 10);

  // Validate hour is a valid number and in expected range
  if (Number.isNaN(hour) || hour < 0 || hour > 23) return undefined;

  // Convert 0 to 24 for comparison (which uses 1-24 format)
  return hour === 0 ? 24 : hour;
};
