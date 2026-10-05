import { Temporal } from '@js-temporal/polyfill';
import type {
  CalendarRecurrenceAnchor,
  CalendarRecurrenceRule,
} from '@tuturuuu/types/primitives/calendar-recurrence';
import { matchesCalendarRecurrenceDate } from './calendar-recurrence-pattern';
import {
  CalendarLocalDateTimeSchema,
  validateCalendarRecurrence,
} from './calendar-recurrence-validation';

/** Validates immutable occurrence identity and counts slots before exceptions.
 * Never trust a caller-provided instance index for COUNT or future splits. */
export function inspectCalendarRecurrenceSlot(input: {
  rule: CalendarRecurrenceRule;
  anchor: CalendarRecurrenceAnchor;
  originalStartLocal: string;
}): {
  precedingCount: number;
  previousRule: CalendarRecurrenceRule | null;
  remainingRule: CalendarRecurrenceRule;
} {
  const { rule, anchor } = validateCalendarRecurrence(input.rule, input.anchor);
  const slot = Temporal.PlainDateTime.from(
    CalendarLocalDateTimeSchema.parse(input.originalStartLocal)
  );
  const first = Temporal.PlainDateTime.from(anchor.startLocal);
  if (
    Temporal.PlainDateTime.compare(slot, first) < 0 ||
    !slot.toPlainTime().equals(first.toPlainTime())
  )
    throw new RangeError('Not a series occurrence');
  let precedingCount = 0;
  let scanned = 0;
  for (
    let date = first.toPlainDate();
    Temporal.PlainDate.compare(date, slot.toPlainDate()) <= 0;
    date = date.add({ days: 1 })
  ) {
    if (++scanned > 36600)
      throw new RangeError('Recurrence scan exceeds 100 years');
    if (
      rule.end.type === 'until' &&
      Temporal.PlainDate.compare(date, rule.end.date) > 0
    )
      break;
    if (!matchesCalendarRecurrenceDate(date, first.toPlainDate(), rule))
      continue;
    const local = date.toPlainDateTime(first.toPlainTime());
    if (
      !local
        .toZonedDateTime(rule.timeZone, { disambiguation: 'compatible' })
        .toPlainDateTime()
        .equals(local)
    )
      continue;
    if (rule.end.type === 'count' && precedingCount >= rule.end.count) break;
    if (local.equals(slot)) {
      return {
        precedingCount,
        previousRule:
          precedingCount === 0
            ? null
            : {
                ...rule,
                end: {
                  type: 'until',
                  date: slot.toPlainDate().subtract({ days: 1 }).toString(),
                },
              },
        remainingRule: {
          ...rule,
          ...(rule.end.type === 'count'
            ? { end: { type: 'count', count: rule.end.count - precedingCount } }
            : {}),
        },
      };
    }
    precedingCount++;
  }
  throw new RangeError('Not a series occurrence');
}

export function calendarAnchorAtSlot(
  anchor: CalendarRecurrenceAnchor,
  originalStartLocal: string
): CalendarRecurrenceAnchor {
  const start = Temporal.PlainDateTime.from(anchor.startLocal);
  const duration = start.until(anchor.endLocal, { largestUnit: 'days' });
  const slot = Temporal.PlainDateTime.from(
    CalendarLocalDateTimeSchema.parse(originalStartLocal)
  );
  return {
    ...anchor,
    startLocal: slot.toString({ smallestUnit: 'second' }),
    endLocal: slot.add(duration).toString({ smallestUnit: 'second' }),
  };
}

/** Immutable original slot as a UTC instant for provider occurrence lookup. */
export function calendarRecurrenceSlotInstant(input: {
  rule: CalendarRecurrenceRule;
  anchor: CalendarRecurrenceAnchor;
  originalStartLocal: string;
}) {
  inspectCalendarRecurrenceSlot(input);
  return Temporal.PlainDateTime.from(input.originalStartLocal)
    .toZonedDateTime(input.rule.timeZone, { disambiguation: 'compatible' })
    .toInstant()
    .toString();
}

/** Normalize a provider date-time without falling back to the machine timezone. */
export function calendarProviderDateTimeLocal(
  input: { dateTime: string; timeZone?: string },
  timeZone: string
) {
  const instant = /(?:Z|[+-]\d{2}:\d{2})$/i.test(input.dateTime)
    ? Temporal.Instant.from(input.dateTime)
    : Temporal.PlainDateTime.from(input.dateTime)
        .toZonedDateTime(input.timeZone ?? timeZone, {
          disambiguation: 'compatible',
        })
        .toInstant();
  if (instant.epochNanoseconds % 1_000_000_000n !== 0n)
    throw new RangeError(
      'Provider occurrence has unsupported fractional precision'
    );
  return instant
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .toString({ smallestUnit: 'second' });
}

/** Original slot interval, before moves/cancellations, for coverage fencing. */
export function calendarRecurrenceSlotBounds(input: {
  rule: CalendarRecurrenceRule;
  anchor: CalendarRecurrenceAnchor;
  originalStartLocal: string;
}) {
  const start = calendarRecurrenceSlotInstant(input);
  const slot = calendarAnchorAtSlot(input.anchor, input.originalStartLocal);
  const end = Temporal.PlainDateTime.from(slot.endLocal)
    .toZonedDateTime(input.rule.timeZone, { disambiguation: 'compatible' })
    .toInstant()
    .toString();
  return { start, end };
}
