import { Temporal } from '@js-temporal/polyfill';
import type {
  CalendarRecurrenceAnchor,
  CalendarRecurrenceException,
  CalendarRecurrenceOccurrence,
  CalendarRecurrenceRule,
} from '@tuturuuu/types/primitives/calendar-recurrence';
import { matchesCalendarRecurrenceDate } from './calendar-recurrence-pattern';
import {
  CalendarRecurrenceAnchorSchema,
  CalendarRecurrenceExceptionSchema,
  validateCalendarRecurrence,
} from './calendar-recurrence-validation';

const MAX_SCANNED_DAYS = 36600;

/** A bounded recurrence expansion. Count is applied before cancellations/moves.
 * Nonexistent DST wall-clock slots are skipped; folds use the earlier instant.
 * Throws on a scan limit rather than presenting incomplete history as complete. */
export function expandCalendarRecurrence(args: {
  rule: CalendarRecurrenceRule;
  anchor: CalendarRecurrenceAnchor;
  from: string;
  to: string;
  exceptions?: CalendarRecurrenceException[];
  limit?: number;
}): { occurrences: CalendarRecurrenceOccurrence[]; truncated: boolean } {
  const { rule, anchor } = validateCalendarRecurrence(args.rule, args.anchor);
  const from = Temporal.Instant.from(args.from);
  const to = Temporal.Instant.from(args.to);
  if (Temporal.Instant.compare(from, to) >= 0)
    throw new RangeError('Invalid recurrence range');
  const limit = args.limit ?? 500;
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new RangeError('Occurrence limit must be 1–1000');
  const start = Temporal.PlainDateTime.from(anchor.startLocal);
  const duration = start.until(anchor.endLocal, { largestUnit: 'days' });
  const first = start.toPlainDate();
  const exceptionBySlot = new Map<string, CalendarRecurrenceException>();
  let stop = to.toZonedDateTimeISO(rule.timeZone).toPlainDate();
  if ((args.exceptions?.length ?? 0) > 1000)
    throw new RangeError('Exception limit exceeds 1000');
  for (const rawException of args.exceptions ?? []) {
    const exception = CalendarRecurrenceExceptionSchema.parse(rawException);
    const slot = Temporal.PlainDateTime.from(
      exception.originalStartLocal
    ).toString({ smallestUnit: 'second' });
    if (exceptionBySlot.has(slot))
      throw new RangeError('Duplicate recurrence exception slot');
    if (exception.startLocal || exception.endLocal) {
      CalendarRecurrenceAnchorSchema.parse({
        startLocal: exception.startLocal,
        endLocal: exception.endLocal,
        allDay: anchor.allDay,
      });
    }
    exceptionBySlot.set(slot, exception);
    const date = Temporal.PlainDateTime.from(slot).toPlainDate();
    if (Temporal.PlainDate.compare(date, stop) > 0) stop = date;
  }
  if (
    rule.end.type === 'until' &&
    Temporal.PlainDate.compare(stop, rule.end.date) > 0
  )
    stop = Temporal.PlainDate.from(rule.end.date);
  // An uncounted rule necessarily visits every date through the effective stop.
  // Reject oversized history before constructing thousands of zoned occurrences.
  // COUNT can terminate earlier, so its existing incremental guard remains below.
  if (
    rule.end.type !== 'count' &&
    first.until(stop, { largestUnit: 'days' }).days >= MAX_SCANNED_DAYS
  )
    throw new RangeError('Recurrence scan exceeds 100 years');
  const occurrences: CalendarRecurrenceOccurrence[] = [];
  let count = 0;
  let scanned = 0;
  for (
    let date = first;
    Temporal.PlainDate.compare(date, stop) <= 0;
    date = date.add({ days: 1 })
  ) {
    if (++scanned > MAX_SCANNED_DAYS)
      throw new RangeError('Recurrence scan exceeds 100 years');
    if (!matchesCalendarRecurrenceDate(date, first, rule)) continue;
    const local = date.toPlainDateTime(start.toPlainTime());
    const zoned = local.toZonedDateTime(rule.timeZone, {
      disambiguation: 'compatible',
    });
    // RFC 5545 invalid/nonexistent local times do not consume COUNT.
    if (!zoned.toPlainDateTime().equals(local)) continue;
    if (rule.end.type === 'count' && ++count > rule.end.count) break;
    const slot = local.toString({ smallestUnit: 'second' });
    const exception = exceptionBySlot.get(slot);
    if (exception?.cancelled) continue;
    const actualStart = exception?.startLocal
      ? Temporal.PlainDateTime.from(exception.startLocal)
      : local;
    const actualEnd = exception?.endLocal
      ? Temporal.PlainDateTime.from(exception.endLocal)
      : local.add(duration);
    const startInstant = actualStart
      .toZonedDateTime(rule.timeZone, { disambiguation: 'compatible' })
      .toInstant();
    const endInstant = actualEnd
      .toZonedDateTime(rule.timeZone, { disambiguation: 'compatible' })
      .toInstant();
    if (Temporal.Instant.compare(endInstant, startInstant) <= 0)
      throw new RangeError('Occurrence end must follow start');
    if (
      Temporal.Instant.compare(startInstant, to) >= 0 ||
      Temporal.Instant.compare(endInstant, from) <= 0
    )
      continue;
    occurrences.push({
      originalStartLocal: slot,
      start_at: startInstant.toString(),
      end_at: endInstant.toString(),
      is_all_day: anchor.allDay,
      isException: Boolean(exception),
    });
  }
  occurrences.sort(
    (a, b) =>
      Temporal.Instant.compare(a.start_at, b.start_at) ||
      a.originalStartLocal.localeCompare(b.originalStartLocal)
  );
  return {
    occurrences: occurrences.slice(0, limit),
    truncated: occurrences.length > limit,
  };
}
