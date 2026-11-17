import { Temporal } from '@js-temporal/polyfill';
import { listValidatedTaskOccurrenceDates } from './task-recurrence-occurrences';
import {
  TaskRecurrenceDateSchema,
  type TaskRecurrenceSchedule,
  type TaskRecurrenceTiming,
  TaskRecurrenceTimingSchema,
  validateTaskRecurrence,
} from './task-recurrence-rule';

export interface TaskOccurrenceInstants {
  occurrenceDate: string;
  /** Local date the instance starts; occurrence date minus the start offset. */
  startDate: string;
  /** Task start_date: the due wall time on the start date. */
  startAt: string;
  /** Task end_date: the due wall time, or the end of the local day. */
  endAt: string;
  /** Earliest instant the scheduler may create the instance: 00:00 local on
   * its start date. */
  generateAt: string;
}

/** A wall time on a local date. Nonexistent times (spring gap) move forward
 * and repeated times (autumn fold) use the earlier instant, so a task
 * occurrence is never skipped. Without a time, the end of the local day. */
function localInstant(
  date: Temporal.PlainDate,
  timeZone: string,
  dueTime: string | null
) {
  if (dueTime === null)
    return date
      .add({ days: 1 })
      .toZonedDateTime({ timeZone })
      .subtract({ milliseconds: 1 })
      .toInstant()
      .toString();
  return date
    .toPlainDateTime(Temporal.PlainTime.from(dueTime))
    .toZonedDateTime(timeZone, { disambiguation: 'compatible' })
    .toInstant()
    .toString();
}

export function taskOccurrenceInstants(
  timing: TaskRecurrenceTiming,
  occurrenceDate: string
): TaskOccurrenceInstants {
  return occurrenceInstants(
    TaskRecurrenceTimingSchema.parse(timing),
    Temporal.PlainDate.from(TaskRecurrenceDateSchema.parse(occurrenceDate))
  );
}

function occurrenceInstants(
  timing: TaskRecurrenceTiming,
  date: Temporal.PlainDate
): TaskOccurrenceInstants {
  const start = date.subtract({ days: timing.startOffsetDays });
  return {
    occurrenceDate: date.toString(),
    startDate: start.toString(),
    startAt: localInstant(start, timing.timeZone, timing.dueTime),
    endAt: localInstant(date, timing.timeZone, timing.dueTime),
    // toZonedDateTime on a PlainDate resolves to the start of the local day,
    // which is later than 00:00 where midnight falls into a DST gap.
    generateAt: start
      .toZonedDateTime({ timeZone: timing.timeZone })
      .toInstant()
      .toString(),
  };
}

function instantsFor(valid: TaskRecurrenceSchedule, date: string) {
  return occurrenceInstants(
    {
      timeZone: valid.rule.timeZone,
      dueTime: valid.dueTime,
      startOffsetDays: valid.startOffsetDays,
    },
    Temporal.PlainDate.from(date)
  );
}

export type TaskRecurrencePlan =
  | { status: 'ended' }
  | { status: 'waiting'; next: TaskOccurrenceInstants }
  | {
      status: 'due';
      /** The occurrence to create now. */
      due: TaskOccurrenceInstants;
      /** Overdue occurrences before `due` that are skipped, never backfilled. */
      skipped: number;
      /** The cursor after `due`, or null when the series ends with it. */
      next: TaskOccurrenceInstants | null;
    };

const MAX_SKIPPED_COUNTED = 1000;

/** Decides what the scheduler creates for a series whose cursor is the next
 * uncreated occurrence date. An occurrence is due from 00:00 local on its
 * start date. Due occurrences dated today or later are created in order, one
 * per call; when every due occurrence is already in the past (downtime), only
 * the latest is created. Skipped dates are counted, capped at 1,000. */
export function planTaskRecurrenceGeneration(
  schedule: TaskRecurrenceSchedule,
  cursor: string | null,
  now: Date | string
): TaskRecurrencePlan {
  const valid = validateTaskRecurrence(schedule);
  if (cursor === null) return { status: 'ended' };
  const list = (
    query: Parameters<typeof listValidatedTaskOccurrenceDates>[1]
  ) => listValidatedTaskOccurrenceDates(valid, query);
  const first = list({ onOrAfter: cursor, limit: 1 })[0];
  if (first === undefined) return { status: 'ended' };
  if (first !== cursor)
    throw new RangeError('Recurrence cursor is not an occurrence date');
  const nowInstant = Temporal.Instant.from(
    typeof now === 'string' ? now : now.toISOString()
  );
  const firstInstants = instantsFor(valid, first);
  if (Temporal.Instant.compare(firstInstants.generateAt, nowInstant) > 0)
    return { status: 'waiting', next: firstInstants };
  // Generation time is monotonic in the occurrence date, so every due
  // occurrence falls on or before today (local) + start offset.
  const today = nowInstant
    .toZonedDateTimeISO(valid.rule.timeZone)
    .toPlainDate()
    .toString();
  const boundary = Temporal.PlainDate.from(today)
    .add({ days: valid.startOffsetDays })
    .toString();
  const upcoming = list({
    onOrAfter: first > today ? first : today,
    limit: 1,
  });
  let due: string;
  if (upcoming[0] !== undefined && upcoming[0] <= boundary) due = upcoming[0];
  else due = latestOnOrBefore(valid, first, boundary);
  const counted =
    due === first ? [] : list({ onOrAfter: first, limit: MAX_SKIPPED_COUNTED });
  const next = list({ after: due, limit: 1 })[0] ?? null;
  return {
    status: 'due',
    due: instantsFor(valid, due),
    skipped: counted.filter((date) => date < due).length,
    next: next === null ? null : instantsFor(valid, next),
  };
}

/** The last occurrence on or before `limit`, not earlier than `first` (itself
 * an occurrence). Consecutive occurrences are at most one period apart
 * (clamped months included), so a one-period window before the last eligible
 * date (the limit, or UNTIL when earlier) holds it. COUNT rules have at most
 * 1,000 dates and are listed from `first`. */
function latestOnOrBefore(
  valid: TaskRecurrenceSchedule,
  first: string,
  limit: string
) {
  const { frequency, interval, end } = valid.rule;
  const last = end.type === 'until' && end.date < limit ? end.date : limit;
  const periodDays =
    interval *
    (frequency === 'daily'
      ? 1
      : frequency === 'weekly'
        ? 7
        : frequency === 'monthly'
          ? 31
          : 366);
  const window = Temporal.PlainDate.from(last)
    .subtract({ days: periodDays })
    .toString();
  let latest = first;
  for (const date of listValidatedTaskOccurrenceDates(
    valid,
    end.type === 'count'
      ? { onOrAfter: first, limit: MAX_SKIPPED_COUNTED }
      : { onOrAfter: window > first ? window : first, limit: 16 }
  )) {
    if (date > last) break;
    latest = date;
  }
  return latest;
}
