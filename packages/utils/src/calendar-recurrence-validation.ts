import { Temporal } from '@js-temporal/polyfill';
import type {
  CalendarRecurrenceAnchor,
  CalendarRecurrenceRule,
} from '@tuturuuu/types/primitives/calendar-recurrence';
import { z } from 'zod';

import {
  CALENDAR_WEEKDAYS,
  matchesCalendarRecurrenceDate,
} from './calendar-recurrence-pattern';

const weekday = z.enum(CALENDAR_WEEKDAYS);
export const CalendarLocalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    try {
      Temporal.PlainDate.from(value, { overflow: 'reject' });
      return true;
    } catch {
      return false;
    }
  }, 'Invalid calendar date');
export const CalendarLocalDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  .refine((value) => {
    try {
      Temporal.PlainDateTime.from(value, { overflow: 'reject' });
      return true;
    } catch {
      return false;
    }
  }, 'Invalid local date-time');

export const CalendarRecurrenceRuleSchema = z
  .object({
    version: z.literal(1),
    frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    interval: z.number().int().min(1).max(1000),
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
    weekStartsOn: weekday.optional(),
    weekdays: z
      .array(weekday)
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length)
      .optional(),
    monthDay: z.number().int().min(1).max(31).optional(),
    monthDayOverflow: z.enum(['skip', 'last-day']).optional(),
    weekIndex: z
      .union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(-1),
      ])
      .optional(),
    month: z.number().int().min(1).max(12).optional(),
    end: z.discriminatedUnion('type', [
      z.object({ type: z.literal('never') }).strict(),
      z
        .object({
          type: z.literal('count'),
          count: z.number().int().min(1).max(10000),
        })
        .strict(),
      z
        .object({ type: z.literal('until'), date: CalendarLocalDateSchema })
        .strict(),
    ]),
  })
  .strict()
  .superRefine((rule, ctx) => {
    const invalid = (message: string) =>
      ctx.addIssue({ code: 'custom', message });
    if (rule.monthDayOverflow && rule.monthDay === undefined)
      invalid('Month-day overflow requires an absolute month day');
    if (
      rule.frequency === 'daily' &&
      (rule.weekdays || rule.monthDay || rule.weekIndex || rule.month)
    )
      invalid('Daily recurrence does not accept selectors');
    if (
      rule.frequency === 'weekly' &&
      (!rule.weekdays || rule.monthDay || rule.weekIndex || rule.month)
    )
      invalid('Weekly recurrence requires only weekday selectors');
    if (rule.frequency === 'monthly' || rule.frequency === 'yearly') {
      if (
        rule.monthDay !== undefined
          ? Boolean(rule.weekdays || rule.weekIndex)
          : !(rule.weekdays && rule.weekIndex)
      )
        invalid('Choose a month day or relative weekdays and index');
      if (rule.frequency === 'yearly' ? !rule.month : rule.month !== undefined)
        invalid('Month is required only for yearly recurrence');
    }
  });
export const CalendarRecurrenceAnchorSchema = z
  .object({
    startLocal: CalendarLocalDateTimeSchema,
    endLocal: CalendarLocalDateTimeSchema,
    allDay: z.boolean(),
  })
  .strict()
  .superRefine((anchor, ctx) => {
    if (Temporal.PlainDateTime.compare(anchor.startLocal, anchor.endLocal) >= 0)
      ctx.addIssue({ code: 'custom', message: 'End must follow start' });
    if (
      anchor.allDay &&
      ![anchor.startLocal, anchor.endLocal].every((value) =>
        value.endsWith('T00:00:00')
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'All-day anchors require exclusive midnight date boundaries',
      });
  });

export function validateCalendarRecurrence(
  rule: CalendarRecurrenceRule,
  anchor: CalendarRecurrenceAnchor
) {
  const validRule = CalendarRecurrenceRuleSchema.parse(rule);
  const validAnchor = CalendarRecurrenceAnchorSchema.parse(anchor);
  if (
    validRule.end.type === 'until' &&
    validRule.end.date < validAnchor.startLocal.slice(0, 10)
  )
    throw new RangeError('Recurrence ends before its anchor');
  const first = Temporal.PlainDateTime.from(
    validAnchor.startLocal
  ).toPlainDate();
  if (!matchesCalendarRecurrenceDate(first, first, validRule))
    throw new RangeError('Series anchor must match its recurrence pattern');
  return { rule: validRule, anchor: validAnchor };
}

export const CalendarRecurrenceExceptionSchema = z
  .object({
    originalStartLocal: CalendarLocalDateTimeSchema,
    cancelled: z.boolean().optional(),
    startLocal: CalendarLocalDateTimeSchema.optional(),
    endLocal: CalendarLocalDateTimeSchema.optional(),
  })
  .strict()
  .superRefine((exception, ctx) => {
    if (Boolean(exception.startLocal) !== Boolean(exception.endLocal))
      ctx.addIssue({
        code: 'custom',
        message: 'Moved occurrences require start and end',
      });
    if (
      exception.startLocal &&
      exception.endLocal &&
      Temporal.PlainDateTime.compare(
        exception.startLocal,
        exception.endLocal
      ) >= 0
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Moved occurrence end must follow start',
      });
  });
