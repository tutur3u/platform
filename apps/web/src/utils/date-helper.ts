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

type TranslationFunction = (
  key: string,
  options?: Record<string, any>
) => string;

export const getDateRangeUnits = (
  t: TranslationFunction
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
  t: TranslationFunction
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
