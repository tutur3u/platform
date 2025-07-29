export function timetzToTime(timetz: string) {
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

export function timetzToHour(timetz?: string) {
  if (!timetz) return undefined;
  const [hourStr] = timetzToTime(timetz).split(':');
  return parseInt(hourStr ?? '0');
}

export function compareTimetz(timetz1: string, timetz2: string) {
  const time1 = timetzToTime(timetz1);
  const time2 = timetzToTime(timetz2);
  return time1.localeCompare(time2);
}

export function minTimetz(timetz1: string, timetz2: string) {
  return compareTimetz(timetz1, timetz2) < 0 ? timetz1 : timetz2;
}

export function maxTimetz(timetz1: string, timetz2: string) {
  return compareTimetz(timetz1, timetz2) > 0 ? timetz1 : timetz2;
}

/**
 * Parses timezone offset from a time string and returns a formatted offset string
 * @param timeString - String like "11:00:00+07:00" or "14:30:00-05:30"
 * @returns Formatted offset string like "+07:00" or "-05:30"
 */
export function parseTimezoneOffset(timeString: string): string {
  if (!timeString) return '';

  // Find the last occurrence of '+' or '-' which indicates the timezone offset
  const lastPlusIndex = timeString.lastIndexOf('+');
  const lastMinusIndex = timeString.lastIndexOf('-');

  // If no offset found, return empty string
  if (lastPlusIndex === -1 && lastMinusIndex === -1) {
    return '';
  }

  // Determine which offset to use (take the last one if both exist)
  const offsetIndex = Math.max(lastPlusIndex, lastMinusIndex);

  // Extract the offset part
  const offsetPart = timeString.substring(offsetIndex);

  // Handle cases where the offset is already in HH:MM format like "+05:30"
  if (offsetPart.includes(':')) {
    // Already in HH:MM format, return as-is
    return offsetPart;
  }

  // Handle legacy decimal format like "+5.5" (for backward compatibility)
  const offset = parseFloat(offsetPart);

  // Handle NaN case
  if (isNaN(offset)) {
    return '';
  }

  // Convert decimal hours to HH:MM format
  const hours = Math.floor(Math.abs(offset));
  const minutes = Math.round((Math.abs(offset) - hours) * 60);

  // Format as HH:MM
  const formattedHours = hours.toString().padStart(2, '0');
  const formattedMinutes = minutes.toString().padStart(2, '0');

  const sign = offset >= 0 ? '+' : '-';
  return `${sign}${formattedHours}:${formattedMinutes}`;
}

/**
 * Formats timezone offset for display in UI
 * @param timeString - String like "11:00:00+07" or "14:30:00-05"
 * @returns Formatted string like "UTC+07:00" or "UTC-05:30"
 */
export function formatTimezoneOffset(timeString: string): string {
  if (!timeString) return '';

  const offset = parseTimezoneOffset(timeString);
  if (!offset) return '';

  return `UTC${offset}`;
}
