import { Temporal } from '@js-temporal/polyfill';
import type {
  CalendarRecurrenceRule,
  CalendarWeekday,
} from '@tuturuuu/types/primitives/calendar-recurrence';
import { z } from 'zod';
import { CALENDAR_WEEKDAYS } from './calendar-recurrence-pattern';
import {
  CalendarLocalDateSchema,
  CalendarRecurrenceRuleSchema,
  validateCalendarRecurrence,
} from './calendar-recurrence-validation';

/** Product bounds for recurring tasks; the database repeats the hard ones. */
export const TASK_RECURRENCE_LIMITS = {
  maxInterval: 99,
  maxCount: 1000,
  maxUntilYears: 5,
  maxStartOffsetDays: 365,
  maxOpenInstancesPerSeries: 3,
  maxActiveSeriesPerWorkspace: 200,
  maxActiveSeriesPerUser: 50,
  maxTemplateIds: 50,
} as const;

export const TASK_RECURRENCE_WEEKDAYS: readonly CalendarWeekday[] = [
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
];

/** The task subset of the calendar recurrence contract (RRULE FREQ, INTERVAL,
 * BYDAY for weekly, BYMONTHDAY clamped to short months, COUNT and UNTIL). */
export const TaskRecurrenceRuleSchema =
  CalendarRecurrenceRuleSchema.superRefine((rule, ctx) => {
    const invalid = (message: string) =>
      ctx.addIssue({ code: 'custom', message });
    if (rule.interval > TASK_RECURRENCE_LIMITS.maxInterval)
      invalid(`Interval must be at most ${TASK_RECURRENCE_LIMITS.maxInterval}`);
    if (rule.weekIndex !== undefined)
      invalid('Relative weekday recurrence is not supported for tasks');
    if ((rule.weekdays || rule.weekStartsOn) && rule.frequency !== 'weekly')
      invalid('Weekdays are supported only for weekly task recurrence');
    if (
      (rule.frequency === 'monthly' || rule.frequency === 'yearly') &&
      rule.monthDayOverflow !== 'last-day'
    )
      invalid('Task month days clamp to the last day of short months');
    if (
      rule.end.type === 'count' &&
      rule.end.count > TASK_RECURRENCE_LIMITS.maxCount
    )
      invalid(`Count must be at most ${TASK_RECURRENCE_LIMITS.maxCount}`);
  });

export const TaskRecurrenceDueTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Expected HH:MM or HH:MM:SS');

/** A local date inside the years task schedules may use, so anchors and
 * cursors stay four-digit ISO dates. */
export const TaskRecurrenceDateSchema = CalendarLocalDateSchema.refine(
  (value) => value >= '1970-01-01' && value <= '2999-12-31',
  'Date must be between 1970 and 2999'
);

export const TaskRecurrenceScheduleSchema = z
  .object({
    rule: TaskRecurrenceRuleSchema,
    /** Local date of the first occurrence in `rule.timeZone`. */
    anchorDate: TaskRecurrenceDateSchema,
    /** Local due wall time; null means the end of the local day. */
    dueTime: TaskRecurrenceDueTimeSchema.nullable(),
    startOffsetDays: z
      .number()
      .int()
      .min(0)
      .max(TASK_RECURRENCE_LIMITS.maxStartOffsetDays),
  })
  .strict();

export const TaskRecurrenceTimingSchema = z
  .object({
    timeZone: z
      .string()
      .max(100)
      .refine((value) => {
        if (/^[+-]/.test(value)) return false;
        try {
          Temporal.Now.zonedDateTimeISO(value);
          return true;
        } catch {
          return false;
        }
      }, 'Expected a named time zone'),
    dueTime: TaskRecurrenceScheduleSchema.shape.dueTime,
    startOffsetDays: TaskRecurrenceScheduleSchema.shape.startOffsetDays,
  })
  .strict();

export type TaskRecurrenceTiming = z.infer<typeof TaskRecurrenceTimingSchema>;

export type TaskRecurrenceSchedule = z.infer<
  typeof TaskRecurrenceScheduleSchema
>;

export function taskRecurrenceAllDayAnchor(anchorDate: string) {
  const date = Temporal.PlainDate.from(anchorDate);
  return {
    startLocal: `${date}T00:00:00`,
    endLocal: `${date.add({ days: 1 })}T00:00:00`,
    allDay: true,
  };
}

/** Full validation for every API edge: task subset, anchor matching the
 * pattern, and UNTIL within five years of the anchor. */
export function validateTaskRecurrence(
  schedule: TaskRecurrenceSchedule
): TaskRecurrenceSchedule {
  const valid = TaskRecurrenceScheduleSchema.parse(schedule);
  validateCalendarRecurrence(
    valid.rule as CalendarRecurrenceRule,
    taskRecurrenceAllDayAnchor(valid.anchorDate)
  );
  if (valid.rule.end.type === 'until') {
    const latest = Temporal.PlainDate.from(valid.anchorDate).add({
      years: TASK_RECURRENCE_LIMITS.maxUntilYears,
    });
    if (Temporal.PlainDate.compare(valid.rule.end.date, latest) > 0)
      throw new RangeError(
        `Recurrence must end within ${TASK_RECURRENCE_LIMITS.maxUntilYears} years`
      );
  }
  return valid;
}

export function taskRecurrenceWeekday(date: string): CalendarWeekday {
  return CALENDAR_WEEKDAYS[Temporal.PlainDate.from(date).dayOfWeek - 1]!;
}

export function sameWeekdaySet(
  a: readonly CalendarWeekday[] | undefined,
  b: readonly CalendarWeekday[]
) {
  return (
    a !== undefined && a.length === b.length && b.every((d) => a.includes(d))
  );
}
