import { Temporal } from '@js-temporal/polyfill';
import type { CalendarRecurrenceAnchor } from '@tuturuuu/types/primitives/calendar-recurrence';
export function recurrenceLocalParts(value: string) {
  const date = Temporal.PlainDateTime.from(value);
  return { day: date.day, month: date.month, dayOfWeek: date.dayOfWeek };
}
export function recurrenceInitialTimes(timeZone: string, now: Date) {
  const start = Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .with({ second: 0, millisecond: 0 });
  return {
    startLocal: start.toString({ smallestUnit: 'minute' }),
    endLocal: start.add({ hours: 1 }).toString({ smallestUnit: 'minute' }),
    day: start.day,
    dayOfWeek: start.dayOfWeek,
  };
}
export function recurrenceInstantLocal(instant: string, timeZone: string) {
  return Temporal.Instant.from(instant)
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .toString({ smallestUnit: 'minute' });
}
export function recurrenceLocalAnchor(
  start: string,
  end: string,
  allDay: boolean
): CalendarRecurrenceAnchor {
  return {
    startLocal: Temporal.PlainDateTime.from(start).toString({
      smallestUnit: 'second',
    }),
    endLocal: Temporal.PlainDateTime.from(end).toString({
      smallestUnit: 'second',
    }),
    allDay,
  };
}
export function recurrenceMidnightRange(startLocal: string, endLocal: string) {
  const start = Temporal.PlainDateTime.from(startLocal).toPlainDate();
  let end = Temporal.PlainDateTime.from(endLocal).toPlainDate();
  if (Temporal.PlainDate.compare(end, start) <= 0) end = start.add({ days: 1 });
  return { startLocal: `${start}T00:00`, endLocal: `${end}T00:00` };
}
