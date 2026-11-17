import { Temporal } from '@js-temporal/polyfill';
import type { CalendarRecurrenceRule } from '@tuturuuu/types/primitives/calendar-recurrence';
import {
  CALENDAR_WEEKDAYS,
  matchesCalendarRecurrenceDate,
} from './calendar-recurrence-pattern';
import { CalendarLocalDateSchema } from './calendar-recurrence-validation';
import {
  TaskRecurrenceRuleSchema,
  type TaskRecurrenceSchedule,
  validateTaskRecurrence,
} from './task-recurrence-rule';

/** Safety bound on generated periods; COUNT ≤ 1,000 and every period of a
 * valid task rule yields at least one date, so real rules stay far below. */
const MAX_PERIODS = 5000;
const MAX_LIST = 1000;

type PlainDate = Temporal.PlainDate;
const compare = Temporal.PlainDate.compare;

function clampedDay(yearMonth: Temporal.PlainYearMonth, day: number) {
  return yearMonth.toPlainDate({ day: Math.min(day, yearMonth.daysInMonth) });
}

/** Steps whole periods from the origin instead of scanning days. `from` lets
 * uncounted rules jump close to a later date without visiting history. Every
 * candidate is checked against the shared calendar pattern matcher. */
function* taskRecurrenceCandidates(
  rule: CalendarRecurrenceRule,
  origin: PlainDate,
  from?: PlainDate
): Generator<PlainDate> {
  const step = rule.interval;
  let firstPeriod = 0;
  if (from && compare(from, origin) > 0) {
    const days = origin.until(from, { largestUnit: 'days' }).days;
    const months = (from.year - origin.year) * 12 + from.month - origin.month;
    const span =
      rule.frequency === 'daily'
        ? days
        : rule.frequency === 'weekly'
          ? Math.floor(days / 7)
          : rule.frequency === 'monthly'
            ? months
            : from.year - origin.year;
    // One period early keeps weekly/clamped boundaries inclusive.
    firstPeriod = Math.max(0, Math.floor(span / step) - 1);
  }
  const weekStart = CALENDAR_WEEKDAYS.indexOf(rule.weekStartsOn ?? 'MO') + 1;
  const originWeek = origin.subtract({
    days: (origin.dayOfWeek - weekStart + 7) % 7,
  });
  const originMonth = origin.toPlainYearMonth();
  const monthDay = rule.monthDay ?? origin.day;
  for (let period = firstPeriod; period < firstPeriod + MAX_PERIODS; period++) {
    const dates: PlainDate[] = [];
    if (rule.frequency === 'daily')
      dates.push(origin.add({ days: period * step }));
    else if (rule.frequency === 'weekly') {
      const week = originWeek.add({ days: period * step * 7 });
      for (let offset = 0; offset < 7; offset++)
        dates.push(week.add({ days: offset }));
    } else if (rule.frequency === 'monthly')
      dates.push(
        clampedDay(originMonth.add({ months: period * step }), monthDay)
      );
    else
      dates.push(
        clampedDay(
          Temporal.PlainYearMonth.from({
            year: origin.year + period * step,
            month: rule.month ?? origin.month,
          }),
          monthDay
        )
      );
    for (const date of dates) {
      if (compare(date, origin) < 0) continue;
      if (!matchesCalendarRecurrenceDate(date, origin, rule)) continue;
      yield date;
    }
  }
  throw new RangeError('Recurrence period scan limit exceeded');
}

/** Occurrence dates of a validated series, honoring COUNT and UNTIL. */
function* seriesDates(
  schedule: TaskRecurrenceSchedule,
  from?: PlainDate
): Generator<PlainDate> {
  const { rule } = schedule;
  const anchor = Temporal.PlainDate.from(schedule.anchorDate);
  const counted = rule.end.type === 'count';
  const until =
    rule.end.type === 'until' ? Temporal.PlainDate.from(rule.end.date) : null;
  let index = 0;
  for (const date of taskRecurrenceCandidates(
    rule as CalendarRecurrenceRule,
    anchor,
    counted ? undefined : from
  )) {
    if (rule.end.type === 'count' && ++index > rule.end.count) return;
    if (until && compare(date, until) > 0) return;
    yield date;
  }
}

export interface TaskOccurrenceQuery {
  /** Exclusive lower bound (local date). */
  after?: string;
  /** Inclusive lower bound (local date). */
  onOrAfter?: string;
}

function lowerBound(query: TaskOccurrenceQuery) {
  const after = query.after
    ? Temporal.PlainDate.from(CalendarLocalDateSchema.parse(query.after)).add({
        days: 1,
      })
    : undefined;
  const onOrAfter = query.onOrAfter
    ? Temporal.PlainDate.from(CalendarLocalDateSchema.parse(query.onOrAfter))
    : undefined;
  if (after && onOrAfter)
    return compare(after, onOrAfter) > 0 ? after : onOrAfter;
  return after ?? onOrAfter;
}

/** Up to `limit` (1–1,000) occurrence dates from the lower bound, in order. */
export function listTaskOccurrenceDates(
  schedule: TaskRecurrenceSchedule,
  query: TaskOccurrenceQuery & { limit: number }
): string[] {
  return listValidatedTaskOccurrenceDates(
    validateTaskRecurrence(schedule),
    query
  );
}

/** As `listTaskOccurrenceDates` for a schedule that `validateTaskRecurrence`
 * already returned, so hot loops validate once. */
export function listValidatedTaskOccurrenceDates(
  valid: TaskRecurrenceSchedule,
  query: TaskOccurrenceQuery & { limit: number }
): string[] {
  if (
    !Number.isInteger(query.limit) ||
    query.limit < 1 ||
    query.limit > MAX_LIST
  )
    throw new RangeError(`Occurrence limit must be 1–${MAX_LIST}`);
  const from = lowerBound(query);
  const result: string[] = [];
  for (const date of seriesDates(valid, from)) {
    if (from && compare(date, from) < 0) continue;
    result.push(date.toString());
    if (result.length >= query.limit) break;
  }
  return result;
}

/** The first occurrence date at or after the bound, or null once ended. */
export function nextTaskOccurrenceDate(
  schedule: TaskRecurrenceSchedule,
  query: TaskOccurrenceQuery = {}
): string | null {
  return listTaskOccurrenceDates(schedule, { ...query, limit: 1 })[0] ?? null;
}

export function isTaskOccurrenceDate(
  schedule: TaskRecurrenceSchedule,
  date: string
): boolean {
  return nextTaskOccurrenceDate(schedule, { onOrAfter: date }) === date;
}

/** First date on or after `date` that a rule would match if the series started
 * there. Presets and the custom editor use it to place the anchor. */
export function snapTaskRecurrenceAnchor(
  rule: CalendarRecurrenceRule,
  date: string
): string {
  const valid = TaskRecurrenceRuleSchema.parse(rule) as CalendarRecurrenceRule;
  const origin = Temporal.PlainDate.from(CalendarLocalDateSchema.parse(date));
  const first = taskRecurrenceCandidates(valid, origin).next();
  if (first.done) throw new RangeError('Recurrence has no occurrences');
  return first.value.toString();
}
