import moment from 'moment';

export type DateRangeOption = 'present' | 'past' | 'future';
export type DateRangeUnit =
  | 'day'
  | 'week'
  | 'month'
  | 'year'
  | 'all'
  | 'custom';

export type DateRange = [Date | null, Date | null];

export const getDateRange = (
  unit: DateRangeUnit,
  option: DateRangeOption
): DateRange => {
  const start = moment();
  const end = moment();

  switch (unit) {
    case 'day':
      switch (option) {
        case 'present':
          start.startOf('day');
          end.endOf('day');
          break;

        case 'past':
          start.subtract(1, 'day').startOf('day');
          end.subtract(1, 'day').endOf('day');
          break;

        case 'future':
          start.add(1, 'day').startOf('day');
          end.add(1, 'day').endOf('day');
          break;
      }
      break;

    case 'week':
      switch (option) {
        case 'present':
          start.startOf('week');
          end.endOf('week');
          break;

        case 'past':
          start.subtract(1, 'week').startOf('week');
          end.subtract(1, 'week').endOf('week');
          break;

        case 'future':
          start.add(1, 'week').startOf('week');
          end.add(1, 'week').endOf('week');
          break;
      }
      break;

    case 'month':
      switch (option) {
        case 'present':
          start.startOf('month');
          end.endOf('month');
          break;

        case 'past':
          start.subtract(1, 'month').startOf('month');
          end.subtract(1, 'month').endOf('month');
          break;

        case 'future':
          start.add(1, 'month').startOf('month');
          end.add(1, 'month').endOf('month');
          break;
      }
      break;

    case 'year':
      switch (option) {
        case 'present':
          start.startOf('year');
          end.endOf('year');
          break;

        case 'past':
          start.subtract(1, 'year').startOf('year');
          end.subtract(1, 'year').endOf('year');
          break;

        case 'future':
          start.add(1, 'year').startOf('year');
          end.add(1, 'year').endOf('year');
          break;
      }
      break;

    case 'all':
      return [null, null];

    case 'custom': {
      throw new Error('Not implemented yet: "custom" case');
    }
  }

  return [start.toDate(), end.toDate()];
};

export const getDateRangeUnits = (
  t: any
): {
  label: string;
  value: DateRangeUnit;
}[] => {
  return [
    { label: t('date_helper.day'), value: 'day' },
    { label: t('date_helper.week'), value: 'week' },
    { label: t('date_helper.month'), value: 'month' },
    { label: t('date_helper.year'), value: 'year' },
    { label: t('date_helper.all'), value: 'all' },
    { label: t('date_helper.custom'), value: 'custom' },
  ];
};

export const getDateRangeOptions = (
  unit: DateRangeUnit,
  t: any
): {
  label: string;
  value: DateRangeOption;
}[] => {
  switch (unit) {
    case 'day':
      return [
        { label: t('date_helper.today'), value: 'present' },
        { label: t('date_helper.yesterday'), value: 'past' },
        { label: t('date_helper.tomorrow'), value: 'future' },
      ];

    case 'week':
      return [
        { label: t('date_helper.this-week'), value: 'present' },
        { label: t('date_helper.last-week'), value: 'past' },
        { label: t('date_helper.next-week'), value: 'future' },
      ];

    case 'month':
      return [
        { label: t('date_helper.this_month'), value: 'present' },
        { label: t('date_helper.last-month'), value: 'past' },
        { label: t('date_helper.next-month'), value: 'future' },
      ];

    case 'year':
      return [
        { label: t('date_helper.this-year'), value: 'present' },
        { label: t('date_helper.last-year'), value: 'past' },
        { label: t('date_helper.next-year'), value: 'future' },
      ];

    case 'all':
      return [{ label: t('date_helper.all'), value: 'present' }];

    default:
      return [];
  }
};

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
 * Combines a date string (YYYY-MM-DD) and a time string with offset (HH:mm:ss+ZZ) into a local Date object.
 * Example: combineDateAndTimetzToLocal('2024-06-01', '23:00:00+07') returns a Date in the user's local timezone.
 */
export function combineDateAndTimetzToLocal(
  dateStr: string,
  timetz: string
): Date {
  // Find the position of the '+' or '-' that indicates the start of the offset
  const offsetPos = Math.max(timetz.lastIndexOf('+'), timetz.lastIndexOf('-'));
  const time = timetz.substring(0, offsetPos);
  const offsetStr = timetz.substring(offsetPos);

  // Split the time into hours, minutes, seconds
  const [hourStr, minuteStr, secondStr] = time.split(':');
  const hour = parseInt(hourStr ?? '0', 10);
  const minute = parseInt(minuteStr ?? '0', 10);
  const second = parseInt(secondStr ?? '0', 10);

  // Parse the offset (e.g., +07 or -05)
  // Support both +HH and +HH:MM formats
  let offsetHours = 0;
  let offsetMinutes = 0;
  if (offsetStr.includes(':')) {
    const sign = offsetStr[0] === '-' ? -1 : 1;
    const [h, m] = offsetStr.slice(1).split(':');
    offsetHours = sign * parseInt(h || '0', 10);
    offsetMinutes = sign * parseInt(m || '0', 10);
  } else {
    offsetHours = parseInt(offsetStr, 10);
  }

  // Create a Date object in UTC for the given date and time in the plan's timezone
  const utcDate = new Date(
    Date.UTC(
      parseInt(dateStr.slice(0, 4), 10), // year
      parseInt(dateStr.slice(5, 7), 10) - 1, // month (0-based)
      parseInt(dateStr.slice(8, 10), 10), // day
      hour - offsetHours, // convert to UTC
      minute - (offsetMinutes || 0),
      second
    )
  );

  // The Date object will be interpreted in the user's local timezone when used
  return utcDate;
}

/**
 * Converts a local Date object back to a time string in the plan's timezone.
 * This is the reverse of combineDateAndTimetzToLocal.
 * Example: convertLocalToPlanTimezone(date, '09:00:00-07') returns a time string in UTC-7.
 */
export function convertLocalToPlanTimezone(
  localDate: Date,
  planTimezoneTime: string
): string {
  // Extract the plan's timezone offset from the plan's time
  const offsetPos = Math.max(
    planTimezoneTime.lastIndexOf('+'),
    planTimezoneTime.lastIndexOf('-')
  );
  const offsetStr = planTimezoneTime.substring(offsetPos);

  // Parse the plan's timezone offset
  let planOffsetHours = 0;
  let planOffsetMinutes = 0;
  if (offsetStr.includes(':')) {
    const sign = offsetStr[0] === '-' ? -1 : 1;
    const [h, m] = offsetStr.slice(1).split(':');
    planOffsetHours = sign * parseInt(h || '0', 10);
    planOffsetMinutes = sign * parseInt(m || '0', 10);
  } else {
    planOffsetHours = parseInt(offsetStr, 10);
  }

  // Date objects already store UTC time internally!
  // localDate.getTime() returns UTC milliseconds
  // So we just need to convert from UTC to plan timezone
  const planTime = new Date(
    localDate.getTime() +
      planOffsetHours * 60 * 60 * 1000 +
      planOffsetMinutes * 60 * 1000
  );

  // Format the time in the plan's timezone
  const hour = planTime.getUTCHours().toString().padStart(2, '0');
  const minute = planTime.getUTCMinutes().toString().padStart(2, '0');
  const second = planTime.getUTCSeconds().toString().padStart(2, '0');

  return `${hour}:${minute}:${second}${offsetStr}`;
}

/**
 * Converts a local Date object to both date and time in the plan's timezone.
 * Returns an object with the date string and time string in the plan's timezone.
 * This handles timezone boundary crossings where the date changes.
 */
export function convertLocalToPlanTimezoneWithDate(
  localDate: Date,
  planTimezoneTime: string
): { date: string; time: string } {
  // Extract the plan's timezone offset from the plan's time
  const offsetPos = Math.max(
    planTimezoneTime.lastIndexOf('+'),
    planTimezoneTime.lastIndexOf('-')
  );
  const offsetStr = planTimezoneTime.substring(offsetPos);

  // Parse the plan's timezone offset
  let planOffsetHours = 0;
  let planOffsetMinutes = 0;
  if (offsetStr.includes(':')) {
    const sign = offsetStr[0] === '-' ? -1 : 1;
    const [h, m] = offsetStr.slice(1).split(':');
    planOffsetHours = sign * parseInt(h || '0', 10);
    planOffsetMinutes = sign * parseInt(m || '0', 10);
  } else {
    planOffsetHours = parseInt(offsetStr, 10);
  }

  // Date objects already store UTC time internally!
  // localDate.getTime() returns UTC milliseconds
  // So we just need to convert from UTC to plan timezone
  const planTime = new Date(
    localDate.getTime() +
      planOffsetHours * 60 * 60 * 1000 +
      planOffsetMinutes * 60 * 1000
  );

  // Format the date and time in the plan's timezone
  const year = planTime.getUTCFullYear();
  const month = (planTime.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = planTime.getUTCDate().toString().padStart(2, '0');
  const hour = planTime.getUTCHours().toString().padStart(2, '0');
  const minute = planTime.getUTCMinutes().toString().padStart(2, '0');
  const second = planTime.getUTCSeconds().toString().padStart(2, '0');

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}:${second}${offsetStr}`,
  };
}
