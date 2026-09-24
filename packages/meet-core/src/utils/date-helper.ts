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
  return parseInt(hourStr ?? '0', 10);
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
