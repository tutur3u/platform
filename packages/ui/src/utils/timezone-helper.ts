import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(timezone);
dayjs.extend(utc);

/**
 * Extracts timezone offset from a timetz string (e.g., "09:00:00+07" -> "+07")
 */
export function extractTimezoneOffset(timetz: string): string {
  const offsetPos = Math.max(timetz.lastIndexOf('+'), timetz.lastIndexOf('-'));
  if (offsetPos === -1) return '+00';
  return timetz.substring(offsetPos);
}

/**
 * Extracts time from a timetz string (e.g., "09:00:00+07" -> "09:00:00")
 */
export function extractTime(timetz: string): string {
  const offsetPos = Math.max(timetz.lastIndexOf('+'), timetz.lastIndexOf('-'));
  if (offsetPos === -1) return timetz;
  return timetz.substring(0, offsetPos);
}

/**
 * Converts a timetz string to a specific timezone
 * @param timetz - Time with timezone (e.g., "09:00:00+07")
 * @param targetTimezone - Target timezone (e.g., "America/New_York")
 * @param referenceDate - Reference date for the conversion (defaults to today)
 * @returns Formatted time in target timezone (e.g., "20:00")
 */
export function convertTimetzToTimezone(
  timetz: string,
  targetTimezone: string,
  referenceDate: string = dayjs().format('YYYY-MM-DD')
): string {
  try {
    // Extract time and timezone offset
    const time = extractTime(timetz);
    const offset = extractTimezoneOffset(timetz);

    // Create a datetime in the plan's timezone
    const planDateTime = dayjs.tz(`${referenceDate} ${time}`, `UTC${offset}`);

    // Convert to target timezone
    const targetDateTime = planDateTime.tz(targetTimezone);

    // Return formatted time
    return targetDateTime.format('HH:mm');
  } catch (error) {
    console.error('Error converting timetz to timezone:', error);
    return timetz; // Fallback to original
  }
}

/**
 * Converts a timetz string to user's local timezone
 * @param timetz - Time with timezone (e.g., "09:00:00+07")
 * @param referenceDate - Reference date for the conversion (defaults to today)
 * @returns Formatted time in user's local timezone (e.g., "20:00")
 */
export function convertTimetzToLocal(
  timetz: string,
  referenceDate: string = dayjs().format('YYYY-MM-DD')
): string {
  const userTimezone = dayjs.tz.guess();
  return convertTimetzToTimezone(timetz, userTimezone, referenceDate);
}

/**
 * Converts local time back to plan timezone format
 * @param localTime - Local time (e.g., "20:00")
 * @param planTimezoneOffset - Plan timezone offset (e.g., "+07")
 * @param referenceDate - Reference date for the conversion (defaults to today)
 * @returns Time in plan timezone format (e.g., "09:00:00+07")
 */
export function convertLocalToTimetz(
  localTime: string,
  planTimezoneOffset: string,
  referenceDate: string = dayjs().format('YYYY-MM-DD')
): string {
  try {
    const userTimezone = dayjs.tz.guess();

    // Create datetime in user's timezone
    const localDateTime = dayjs.tz(
      `${referenceDate} ${localTime}`,
      userTimezone
    );

    // Convert to plan timezone
    const planDateTime = localDateTime.tz(`UTC${planTimezoneOffset}`);

    // Return in timetz format
    return `${planDateTime.format('HH:mm:ss')}${planTimezoneOffset}`;
  } catch (error) {
    console.error('Error converting local time to timetz:', error);
    return `${localTime}:00${planTimezoneOffset}`; // Fallback
  }
}

/**
 * Checks if a time range spans midnight in the user's timezone
 * @param startTimetz - Start time with timezone
 * @param endTimetz - End time with timezone
 * @param dateStr - Date string (YYYY-MM-DD)
 * @returns true if the time range spans midnight
 */
export function doesTimeSpanMidnight(
  startTimetz: string,
  endTimetz: string,
  dateStr: string
): boolean {
  try {
    const userTimezone = dayjs.tz.guess();

    const startTime = extractTime(startTimetz);
    const startOffset = extractTimezoneOffset(startTimetz);
    const endTime = extractTime(endTimetz);
    const endOffset = extractTimezoneOffset(endTimetz);

    // Create start and end datetimes in plan timezone
    const startDateTime = dayjs.tz(
      `${dateStr} ${startTime}`,
      `UTC${startOffset}`
    );
    const endDateTime = dayjs.tz(`${dateStr} ${endTime}`, `UTC${endOffset}`);

    // Convert to user timezone
    const userStartDateTime = startDateTime.tz(userTimezone);
    const userEndDateTime = endDateTime.tz(userTimezone);

    // Check if end time is before start time (spans midnight)
    return userEndDateTime.isBefore(userStartDateTime);
  } catch (error) {
    console.error('Error checking midnight span:', error);
    return false;
  }
}

/**
 * Gets the end date for a time range that spans midnight
 * @param startTimetz - Start time with timezone
 * @param endTimetz - End time with timezone
 * @param dateStr - Start date string (YYYY-MM-DD)
 * @returns End date string (YYYY-MM-DD)
 */
export function getEndDateForMidnightSpan(
  startTimetz: string,
  endTimetz: string,
  dateStr: string
): string {
  if (!doesTimeSpanMidnight(startTimetz, endTimetz, dateStr)) {
    return dateStr;
  }

  // If spans midnight, end date is the next day
  return dayjs(dateStr).add(1, 'day').format('YYYY-MM-DD');
}

/**
 * Formats a time range for display, handling midnight spans
 * @param startTimetz - Start time with timezone
 * @param endTimetz - End time with timezone
 * @param dateStr - Date string (YYYY-MM-DD)
 * @returns Formatted time range string
 */
export function formatTimeRange(
  startTimetz: string,
  endTimetz: string,
  dateStr: string
): string {
  const userTimezone = dayjs.tz.guess();
  const startTime = convertTimetzToTimezone(startTimetz, userTimezone, dateStr);
  const endTime = convertTimetzToTimezone(endTimetz, userTimezone, dateStr);

  if (doesTimeSpanMidnight(startTimetz, endTimetz, dateStr)) {
    const endDate = getEndDateForMidnightSpan(startTimetz, endTimetz, dateStr);
    return `${startTime} - ${endTime} (next day)`;
  }

  return `${startTime} - ${endTime}`;
}

/**
 * Gets the timezone offset in hours from a timetz string
 * @param timetz - Time with timezone (e.g., "09:00:00+07")
 * @returns Timezone offset in hours (e.g., 7)
 */
export function getTimezoneOffsetHours(timetz: string): number {
  const offset = extractTimezoneOffset(timetz);
  return parseInt(offset, 10);
}

/**
 * Gets the timezone name from a timetz string (if possible)
 * @param timetz - Time with timezone (e.g., "09:00:00+07")
 * @returns Timezone name or offset string
 */
export function getTimezoneName(timetz: string): string {
  const offset = extractTimezoneOffset(timetz);

  // Map common offsets to timezone names
  const offsetMap: Record<string, string> = {
    '+00': 'UTC',
    '+01': 'Europe/London',
    '+02': 'Europe/Berlin',
    '+03': 'Europe/Moscow',
    '+04': 'Asia/Dubai',
    '+05': 'Asia/Kolkata',
    '+05:30': 'Asia/Kolkata',
    '+06': 'Asia/Almaty',
    '+07': 'Asia/Bangkok',
    '+08': 'Asia/Shanghai',
    '+09': 'Asia/Tokyo',
    '+10': 'Australia/Sydney',
    '+11': 'Pacific/Guadalcanal',
    '+12': 'Pacific/Auckland',
    '-05': 'America/New_York',
    '-06': 'America/Chicago',
    '-07': 'America/Denver',
    '-08': 'America/Los_Angeles',
    '-09': 'America/Anchorage',
    '-10': 'Pacific/Honolulu',
  };

  return offsetMap[offset] || `UTC${offset}`;
}
