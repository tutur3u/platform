import { Temporal } from '@js-temporal/polyfill';
import type {
  CalendarRecurrenceRule,
  CalendarWeekday,
} from '@tuturuuu/types/primitives/calendar-recurrence';
import { CALENDAR_WEEKDAYS } from './calendar-recurrence-pattern';
import { toGoogleCalendarRecurrence } from './calendar-recurrence-providers';
import {
  listValidatedTaskOccurrenceDates,
  snapTaskRecurrenceAnchor,
} from './task-recurrence-occurrences';
import {
  sameWeekdaySet,
  TASK_RECURRENCE_WEEKDAYS,
  TaskRecurrenceDateSchema,
  TaskRecurrenceRuleSchema,
  type TaskRecurrenceSchedule,
  taskRecurrenceAllDayAnchor,
  taskRecurrenceWeekday,
  validateTaskRecurrence,
} from './task-recurrence-rule';

export const TASK_RECURRENCE_PRESETS = [
  'daily',
  'weekdays',
  'weekly',
  'monthly',
] as const;
export type TaskRecurrencePreset = (typeof TASK_RECURRENCE_PRESETS)[number];

export interface TaskRecurrenceTimingInput {
  timeZone: string;
  dueTime?: string | null;
  startOffsetDays?: number;
}

export interface CustomTaskRecurrenceInput extends TaskRecurrenceTimingInput {
  frequency: CalendarRecurrenceRule['frequency'];
  interval: number;
  /** Weekly only; defaults to the start date's weekday. */
  weekdays?: CalendarWeekday[];
  /** Monthly and yearly; defaults to the start date's day. */
  monthDay?: number;
  /** Yearly only; defaults to the start date's month. */
  month?: number;
  weekStartsOn?: CalendarWeekday;
  end?: CalendarRecurrenceRule['end'];
}

/** Builds a validated series from the custom editor. The anchor is the first
 * matching date on or after `startDate` (for example the next weekday).
 * Fields that do not apply to the frequency are rejected, not dropped. */
export function buildCustomTaskRecurrence(
  startDate: string,
  input: CustomTaskRecurrenceInput
): TaskRecurrenceSchedule {
  const start = Temporal.PlainDate.from(
    TaskRecurrenceDateSchema.parse(startDate)
  );
  const monthly = input.frequency === 'monthly' || input.frequency === 'yearly';
  const rule: CalendarRecurrenceRule = {
    version: 1,
    frequency: input.frequency,
    interval: input.interval,
    timeZone: input.timeZone,
    end: input.end ?? { type: 'never' },
  };
  if (input.weekStartsOn) rule.weekStartsOn = input.weekStartsOn;
  if (input.weekdays?.length || input.frequency === 'weekly')
    rule.weekdays = sortWeekdays(
      input.weekdays?.length
        ? input.weekdays
        : [taskRecurrenceWeekday(startDate)],
      input.weekStartsOn
    );
  if (input.monthDay !== undefined || monthly) {
    rule.monthDay = input.monthDay ?? start.day;
    rule.monthDayOverflow = 'last-day';
  }
  if (input.month !== undefined || input.frequency === 'yearly')
    rule.month = input.month ?? start.month;
  const valid = TaskRecurrenceRuleSchema.parse(rule) as CalendarRecurrenceRule;
  return validateTaskRecurrence({
    rule: valid,
    anchorDate: snapTaskRecurrenceAnchor(valid, startDate),
    dueTime: input.dueTime ?? null,
    startOffsetDays: input.startOffsetDays ?? 0,
  });
}

/** Builds a preset from the due date: "Weekly on {its weekday}", "Monthly on
 * day {its day}". Weekdays moves a weekend date to the next Monday. */
export function buildTaskRecurrencePreset(
  preset: TaskRecurrencePreset,
  startDate: string,
  timing: TaskRecurrenceTimingInput
): TaskRecurrenceSchedule {
  const base = { ...timing, interval: 1 };
  switch (preset) {
    case 'daily':
      return buildCustomTaskRecurrence(startDate, {
        ...base,
        frequency: 'daily',
      });
    case 'weekdays':
      return buildCustomTaskRecurrence(startDate, {
        ...base,
        frequency: 'weekly',
        weekdays: [...TASK_RECURRENCE_WEEKDAYS],
      });
    case 'weekly':
      return buildCustomTaskRecurrence(startDate, {
        ...base,
        frequency: 'weekly',
      });
    case 'monthly':
      return buildCustomTaskRecurrence(startDate, {
        ...base,
        frequency: 'monthly',
      });
  }
}

/** The preset a schedule round-trips to, or 'custom'. */
export function detectTaskRecurrencePreset(
  schedule: TaskRecurrenceSchedule
): TaskRecurrencePreset | 'custom' {
  const { rule, anchorDate } = schedule;
  if (rule.interval !== 1 || rule.end.type !== 'never') return 'custom';
  if (rule.frequency === 'daily') return 'daily';
  if (rule.frequency === 'weekly' && (rule.weekStartsOn ?? 'MO') === 'MO') {
    if (sameWeekdaySet(rule.weekdays, TASK_RECURRENCE_WEEKDAYS))
      return 'weekdays';
    if (sameWeekdaySet(rule.weekdays, [taskRecurrenceWeekday(anchorDate)]))
      return 'weekly';
  }
  if (
    rule.frequency === 'monthly' &&
    rule.monthDay === Temporal.PlainDate.from(anchorDate).day
  )
    return 'monthly';
  return 'custom';
}

export interface TaskRecurrenceSummary {
  preset: TaskRecurrencePreset | 'custom';
  frequency: CalendarRecurrenceRule['frequency'];
  interval: number;
  /** Weekly selection, ordered from the week start. */
  weekdays: CalendarWeekday[];
  monthDay: number | null;
  month: number | null;
  end: CalendarRecurrenceRule['end'];
  timeZone: string;
  /** Upcoming occurrence dates (local) from the requested date. */
  nextDates: string[];
}

/** Locale-free summary inputs; UI copy formats them per locale. */
export function summarizeTaskRecurrence(
  schedule: TaskRecurrenceSchedule,
  options: { onOrAfter?: string; nextCount?: number } = {}
): TaskRecurrenceSummary {
  const valid = validateTaskRecurrence(schedule);
  const { rule } = valid;
  return {
    preset: detectTaskRecurrencePreset(valid),
    frequency: rule.frequency,
    interval: rule.interval,
    weekdays: sortWeekdays(rule.weekdays ?? [], rule.weekStartsOn),
    monthDay: rule.monthDay ?? null,
    month: rule.month ?? null,
    end: rule.end,
    timeZone: rule.timeZone,
    nextDates: listValidatedTaskOccurrenceDates(valid, {
      onOrAfter: options.onOrAfter ?? valid.anchorDate,
      limit: options.nextCount ?? 3,
    }),
  };
}

/** RFC 5545 lines for agents and integrations; never stored. DTSTART is the
 * all-day anchor, which fixes the interval phase and the COUNT origin; the
 * zone is returned beside it because all-day DTSTART carries no TZID. */
export function toTaskRecurrenceRRule(schedule: TaskRecurrenceSchedule) {
  const valid = validateTaskRecurrence(schedule);
  return {
    dtstart: `DTSTART;VALUE=DATE:${valid.anchorDate.replaceAll('-', '')}`,
    rrule: toGoogleCalendarRecurrence(
      valid.rule as CalendarRecurrenceRule,
      taskRecurrenceAllDayAnchor(valid.anchorDate)
    )[0]!,
    timeZone: valid.rule.timeZone,
  };
}

function sortWeekdays(
  days: readonly CalendarWeekday[],
  weekStartsOn: CalendarWeekday = 'MO'
) {
  const start = CALENDAR_WEEKDAYS.indexOf(weekStartsOn);
  const rank = (day: CalendarWeekday) =>
    (CALENDAR_WEEKDAYS.indexOf(day) - start + 7) % 7;
  return [...new Set(days)].sort((a, b) => rank(a) - rank(b));
}
