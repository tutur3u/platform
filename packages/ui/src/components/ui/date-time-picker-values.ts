import {
  buildDateInTimezone,
  formatInTimezone,
  getDatePartsInTimezone,
} from '@tuturuuu/utils/task-date-timezone';
import { format } from 'date-fns';

/** A date-only carrier for the browser-local calendar widget, never an instant. */
export function pickerCalendarDate(date: Date, zone: string | null): Date {
  const parts = zone
    ? getDatePartsInTimezone(date, zone)
    : {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
      };
  return new Date(parts.year, parts.month - 1, parts.day);
}

export function pickerTimeValue(date: Date, zone: string | null): string {
  return zone ? formatInTimezone(date, zone, 'HH:mm') : format(date, 'HH:mm');
}

/** Reject nonexistent wall times and preserve an unchanged ambiguous instant. */
export function pickerWallTime(
  base: Date,
  hour: number,
  minute: number,
  zone: string | null
): Date | undefined {
  if (!zone) {
    if (base.getHours() === hour && base.getMinutes() === minute)
      return new Date(base);
    const next = new Date(base);
    next.setHours(hour, minute, 0, 0);
    return next.getHours() === hour && next.getMinutes() === minute
      ? next
      : undefined;
  }
  const parts = getDatePartsInTimezone(base, zone);
  if (parts.hour === hour && parts.minute === minute) return new Date(base);
  const next = buildDateInTimezone(
    parts.year,
    parts.month,
    parts.day,
    hour,
    minute,
    zone
  );
  const roundTrip = getDatePartsInTimezone(next, zone);
  return roundTrip.year === parts.year &&
    roundTrip.month === parts.month &&
    roundTrip.day === parts.day &&
    roundTrip.hour === hour &&
    roundTrip.minute === minute
    ? next
    : undefined;
}

export function createPickerTimeOptions(timeFormat: '12h' | '24h') {
  return Array.from({ length: 96 }, (_, index) => {
    const value = `${Math.floor(index / 4)
      .toString()
      .padStart(2, '0')}:${((index % 4) * 15).toString().padStart(2, '0')}`;
    return {
      value,
      // Clock labels have no date or zone; constructing a browser-local Date
      // would normalize 02:xx on a DST-gap day even for another calendar zone.
      display:
        timeFormat === '24h'
          ? value
          : `${Math.floor(index / 4) % 12 || 12}:${value.slice(3)} ${index < 48 ? 'AM' : 'PM'}`,
    };
  });
}

export function filterPickerTimeOptions(args: {
  date?: Date;
  minDate?: Date;
  maxDate?: Date;
  minTime?: string;
  zone: string | null;
  pattern: string;
  timeFormat: '12h' | '24h';
  options: { value: string; display: string }[];
}) {
  const { date, minDate, maxDate, minTime, zone, pattern, timeFormat } = args;
  let options = args.options;
  if (date) {
    options = options.filter(({ value }) => {
      const [hour, minute] = value.split(':').map(Number);
      return pickerWallTime(date, hour!, minute!, zone) !== undefined;
    });
  }
  const sameDay = (other: Date) =>
    date &&
    pickerCalendarDate(date, zone).getTime() ===
      pickerCalendarDate(other, zone).getTime();
  if (minTime && minDate && sameDay(minDate)) {
    options = options.filter((time) => time.value > minTime);
  }
  if (maxDate && sameDay(maxDate)) {
    options = options.filter(
      (time) => time.value < pickerTimeValue(maxDate, zone)
    );
  }
  // Keep a pre-existing custom value visible; never change the stored instant
  // merely because the value is outside the available fifteen-minute options.
  if (date) {
    const value = pickerTimeValue(date, zone);
    if (!options.some((time) => time.value === value)) {
      const display = zone
        ? formatInTimezone(
            date,
            zone,
            timeFormat === '24h' ? 'HH:mm' : 'h:mm A'
          )
        : format(date, pattern);
      options = [...options, { value, display }].sort((a, b) =>
        a.value.localeCompare(b.value)
      );
    }
  }
  return options;
}

export function pickerCalendarBounds(
  minDate: Date | undefined,
  maxDate: Date | undefined,
  zone: string | null
) {
  return minDate || maxDate
    ? [
        ...(minDate ? [{ before: pickerCalendarDate(minDate, zone) }] : []),
        ...(maxDate ? [{ after: pickerCalendarDate(maxDate, zone) }] : []),
      ]
    : undefined;
}
