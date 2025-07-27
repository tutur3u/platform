import timezones from '@tuturuuu/utils/timezones';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(timezone);
dayjs.extend(utc);

/**
 * Extracts timezone offset from a timetz string (e.g., "09:00:00+07" -> "+07")
 */
function extractTimezoneOffset(timetz: string): string {
  const offsetPos = Math.max(timetz.lastIndexOf('+'), timetz.lastIndexOf('-'));
  if (offsetPos === -1) return '+00';
  return timetz.substring(offsetPos);
}

/**
 * Extracts time from a timetz string (e.g., "09:00:00+07" -> "09:00:00")
 */
function extractTime(timetz: string): string {
  const offsetPos = Math.max(timetz.lastIndexOf('+'), timetz.lastIndexOf('-'));
  if (offsetPos === -1) return timetz;
  return timetz.substring(0, offsetPos);
}

export function timetzToTime(timetz: string, dateStr?: string) {
  try {
    // Use current date if no date provided (for backward compatibility)
    const referenceDate = dateStr || dayjs().format('YYYY-MM-DD');
    const userTimezone = dayjs.tz.guess();

    // Extract time and timezone offset
    const time = extractTime(timetz);
    const offset = extractTimezoneOffset(timetz);

    // Convert offset to proper timezone name for day.js
    const timezoneName = getTimezoneFromOffset(offset);

    // Create a datetime in the plan's timezone
    const planDateTime = dayjs.tz(`${referenceDate} ${time}`, timezoneName);

    // Convert to user's timezone
    const userDateTime = planDateTime.tz(userTimezone);

    // Check if the date has changed due to timezone conversion
    const originalDate = dayjs(referenceDate);
    const convertedDate = userDateTime.format('YYYY-MM-DD');
    const isNextDay =
      convertedDate !== referenceDate && userDateTime.isAfter(originalDate);
    const isPreviousDay =
      convertedDate !== referenceDate && userDateTime.isBefore(originalDate);

    // Return formatted time with date indicator if needed
    const timeStr = userDateTime.format('HH:mm');

    if (isNextDay) {
      return `${timeStr} (next day)`;
    } else if (isPreviousDay) {
      return `${timeStr} (previous day)`;
    }

    return timeStr;
  } catch (error) {
    console.error('Error converting timetz to time:', error);
    // Fallback to original manual conversion for backward compatibility
    return timetzToTimeFallback(timetz);
  }
}

/**
 * Enhanced timezone conversion that returns detailed information about date changes
 */
export function timetzToTimeWithDate(timetz: string, dateStr?: string) {
  try {
    // Use current date if no date provided (for backward compatibility)
    const referenceDate = dateStr || dayjs().format('YYYY-MM-DD');
    const userTimezone = dayjs.tz.guess();

    // Extract time and timezone offset
    const time = extractTime(timetz);
    const offset = extractTimezoneOffset(timetz);

    // Convert offset to proper timezone name for day.js
    const timezoneName = getTimezoneFromOffset(offset);

    // Create a datetime in the plan's timezone
    const planDateTime = dayjs.tz(`${referenceDate} ${time}`, timezoneName);

    // Convert to user's timezone
    const userDateTime = planDateTime.tz(userTimezone);

    // Check if the date has changed due to timezone conversion
    const originalDate = dayjs(referenceDate);
    const convertedDate = userDateTime.format('YYYY-MM-DD');
    const isNextDay =
      convertedDate !== referenceDate && userDateTime.isAfter(originalDate);
    const isPreviousDay =
      convertedDate !== referenceDate && userDateTime.isBefore(originalDate);

    return {
      time: userDateTime.format('HH:mm'),
      date: convertedDate,
      isNextDay,
      isPreviousDay,
      originalDate: referenceDate,
      userTimezone,
      planTimezone: timezoneName,
    };
  } catch (error) {
    console.error('Error converting timetz to time with date:', error);
    return null;
  }
}

// Enhanced function to get proper timezone from offset using the comprehensive timezone database
function getTimezoneFromOffset(offset: string): string {
  const offsetNum = parseInt(offset, 10);

  // Find timezone entries that match this offset
  const matchingTimezones = timezones.filter((tz) => tz.offset === offsetNum);

  if (matchingTimezones.length > 0) {
    // Prefer non-DST timezones first, then take the first available
    const nonDstTimezone = matchingTimezones.find((tz) => !tz.isdst);
    if (nonDstTimezone?.utc?.[0]) {
      return nonDstTimezone.utc[0]; // Return the first IANA timezone name
    }

    // If no non-DST timezone found, use the first available
    const firstTimezone = matchingTimezones[0];
    if (firstTimezone?.utc?.[0]) {
      return firstTimezone.utc[0];
    }
  }

  // Fallback to simple mapping for edge cases
  const offsetMap: Record<string, string> = {
    '+00': 'UTC',
    '+01': 'Europe/London',
    '+02': 'Europe/Berlin',
    '+03': 'Europe/Moscow',
    '+04': 'Asia/Dubai',
    '+05': 'Asia/Kolkata',
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
    '-11': 'Pacific/Midway',
    '-12': 'Pacific/Kwajalein',
  };

  return offsetMap[offset] || 'UTC';
}

// Fallback function for backward compatibility
function timetzToTimeFallback(timetz: string) {
  // Find the position of the '+' or '-' that indicates the start of the offset
  const offsetPos = Math.max(timetz.lastIndexOf('+'), timetz.lastIndexOf('-'));

  // Split the input string into the time and offset parts
  const time = timetz.substring(0, offsetPos);
  const offsetStr = timetz.substring(offsetPos);

  // Split the time into hours and minutes
  const [hourStr, minuteStr] = time.split(':');

  // Parse the hour, minute, and offset as integers
  const hour = parseInt(hourStr ?? '0', 10);
  const minute = parseInt(minuteStr ?? '0', 10);
  const offset = parseInt(offsetStr, 10);

  // Get the current date and time
  const date = new Date();

  // Get the current user's timezone offset in hours
  const currentUserOffset = -date.getTimezoneOffset() / 60;

  // Calculate the difference between the user's timezone and the offset
  const offsetDiff = currentUserOffset - offset;

  // Set the hour and minute to the input time, adjusted by the offset difference
  date.setHours(hour + offsetDiff);
  date.setMinutes(minute);

  // Format the hour and minute with leading zeros if necessary
  const hourFormatted = date.getHours().toString().padStart(2, '0');
  const minuteFormatted = date.getMinutes().toString().padStart(2, '0');

  // Return the time in the user's timezone
  return `${hourFormatted}:${minuteFormatted}`;
}

export function timetzToHour(timetz?: string, dateStr?: string) {
  if (!timetz) return undefined;
  const [hourStr] = timetzToTime(timetz, dateStr).split(':');
  return parseInt(hourStr ?? '0');
}

export function compareTimetz(
  timetz1: string,
  timetz2: string,
  dateStr?: string
) {
  const time1 = timetzToTime(timetz1, dateStr);
  const time2 = timetzToTime(timetz2, dateStr);
  return time1.localeCompare(time2);
}

export function minTimetz(timetz1: string, timetz2: string, dateStr?: string) {
  return compareTimetz(timetz1, timetz2, dateStr) < 0 ? timetz1 : timetz2;
}

export function maxTimetz(timetz1: string, timetz2: string, dateStr?: string) {
  return compareTimetz(timetz1, timetz2, dateStr) > 0 ? timetz1 : timetz2;
}

/**
 * Checks if a time range spans midnight in the user's timezone
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
      getTimezoneFromOffset(startOffset)
    );
    const endDateTime = dayjs.tz(
      `${dateStr} ${endTime}`,
      getTimezoneFromOffset(endOffset)
    );

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
