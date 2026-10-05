import { Temporal } from '@js-temporal/polyfill';
import type {
  CalendarRecurrenceAnchor,
  CalendarRecurrenceRule,
  CalendarWeekday,
} from '@tuturuuu/types/primitives/calendar-recurrence';
import { CALENDAR_WEEKDAYS } from './calendar-recurrence-pattern';
import {
  CalendarRecurrenceRuleSchema,
  validateCalendarRecurrence,
} from './calendar-recurrence-validation';

const graphDays = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
const indexes = ['first', 'second', 'third', 'fourth', 'last'] as const;
export class UnsupportedCalendarRecurrenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedCalendarRecurrenceError';
  }
}
export interface GraphCalendarRecurrence {
  pattern: {
    type: string;
    interval: number;
    dayOfMonth?: number;
    daysOfWeek?: string[];
    firstDayOfWeek?: string;
    index?: string;
    month?: number;
  };
  range: {
    type: string;
    startDate: string;
    recurrenceTimeZone?: string;
    endDate?: string;
    numberOfOccurrences?: number;
  };
}
function graphDay(day: CalendarWeekday) {
  return graphDays[CALENDAR_WEEKDAYS.indexOf(day)]!;
}
function canonicalDay(day: string): CalendarWeekday {
  const index = graphDays.indexOf(day as (typeof graphDays)[number]);
  if (index < 0)
    throw new UnsupportedCalendarRecurrenceError('Unknown provider weekday');
  return CALENDAR_WEEKDAYS[index]!;
}

export function toGraphCalendarRecurrence(
  rule: CalendarRecurrenceRule,
  anchor: CalendarRecurrenceAnchor
): GraphCalendarRecurrence {
  validateCalendarRecurrence(rule, anchor);
  if (
    rule.monthDay &&
    rule.monthDay > 28 &&
    rule.monthDayOverflow !== 'last-day'
  )
    throw new UnsupportedCalendarRecurrenceError(
      'Outlook clamps missing month days; choose last-day overflow explicitly'
    );
  const relative = rule.weekIndex !== undefined;
  const pattern: GraphCalendarRecurrence['pattern'] = {
    type:
      rule.frequency === 'monthly'
        ? relative
          ? 'relativeMonthly'
          : 'absoluteMonthly'
        : rule.frequency === 'yearly'
          ? relative
            ? 'relativeYearly'
            : 'absoluteYearly'
          : rule.frequency,
    interval: rule.interval,
    ...(rule.monthDay === undefined ? {} : { dayOfMonth: rule.monthDay }),
    ...(rule.month === undefined ? {} : { month: rule.month }),
    ...(rule.weekdays ? { daysOfWeek: rule.weekdays.map(graphDay) } : {}),
    ...(rule.frequency === 'weekly'
      ? { firstDayOfWeek: graphDay(rule.weekStartsOn ?? 'MO') }
      : {}),
    ...(relative
      ? { index: indexes[rule.weekIndex === -1 ? 4 : rule.weekIndex! - 1] }
      : {}),
  };
  return {
    pattern,
    range: {
      type:
        rule.end.type === 'count'
          ? 'numbered'
          : rule.end.type === 'until'
            ? 'endDate'
            : 'noEnd',
      startDate: anchor.startLocal.slice(0, 10),
      recurrenceTimeZone: rule.timeZone,
      ...(rule.end.type === 'count'
        ? { numberOfOccurrences: rule.end.count }
        : {}),
      ...(rule.end.type === 'until' ? { endDate: rule.end.date } : {}),
    },
  };
}

export function fromGraphCalendarRecurrence(
  value: GraphCalendarRecurrence,
  timeZone: string
): CalendarRecurrenceRule {
  const { pattern, range } = value;
  const frequencies: Record<string, CalendarRecurrenceRule['frequency']> = {
    daily: 'daily',
    weekly: 'weekly',
    absoluteMonthly: 'monthly',
    relativeMonthly: 'monthly',
    absoluteYearly: 'yearly',
    relativeYearly: 'yearly',
  };
  const frequency = frequencies[pattern.type];
  if (!frequency)
    throw new UnsupportedCalendarRecurrenceError(
      'Unknown provider recurrence pattern'
    );
  const relative = pattern.type.startsWith('relative');
  const index = indexes.indexOf(
    (pattern.index ?? 'first') as (typeof indexes)[number]
  );
  if (relative && index < 0)
    throw new UnsupportedCalendarRecurrenceError(
      'Unknown provider recurrence index'
    );
  if (!['numbered', 'endDate', 'noEnd'].includes(range.type))
    throw new UnsupportedCalendarRecurrenceError(
      'Unknown provider recurrence range'
    );
  return CalendarRecurrenceRuleSchema.parse({
    version: 1,
    frequency,
    interval: pattern.interval,
    timeZone: range.recurrenceTimeZone || timeZone,
    ...(frequency === 'weekly' || relative
      ? { weekdays: pattern.daysOfWeek?.map(canonicalDay) }
      : {}),
    ...(frequency === 'weekly'
      ? { weekStartsOn: canonicalDay(pattern.firstDayOfWeek ?? 'sunday') }
      : {}),
    ...(relative ? { weekIndex: index === 4 ? -1 : index + 1 } : {}),
    ...(!relative && (frequency === 'monthly' || frequency === 'yearly')
      ? {
          monthDay: pattern.dayOfMonth,
          ...(pattern.dayOfMonth && pattern.dayOfMonth > 28
            ? { monthDayOverflow: 'last-day' }
            : {}),
        }
      : {}),
    ...(frequency === 'yearly' ? { month: pattern.month } : {}),
    end:
      range.type === 'numbered'
        ? { type: 'count', count: range.numberOfOccurrences }
        : range.type === 'endDate'
          ? { type: 'until', date: range.endDate }
          : { type: 'never' },
  });
}

export function toGoogleCalendarRecurrence(
  rule: CalendarRecurrenceRule,
  anchor: CalendarRecurrenceAnchor
): string[] {
  validateCalendarRecurrence(rule, anchor);
  const parts = [
    `FREQ=${rule.frequency.toUpperCase()}`,
    `INTERVAL=${rule.interval}`,
  ];
  if (rule.frequency === 'weekly')
    parts.push(`WKST=${rule.weekStartsOn ?? 'MO'}`);
  if (rule.weekdays) {
    parts.push(
      `BYDAY=${rule.weekdays.map((day) => `${rule.weekIndex ?? ''}${day}`).join(',')}`
    );
    if (rule.weekIndex !== undefined && rule.weekdays.length > 1)
      parts.push('BYSETPOS=1');
  }
  if (rule.monthDay !== undefined) {
    if (rule.monthDayOverflow === 'last-day' && rule.monthDay > 28) {
      parts.push(
        `BYMONTHDAY=${Array.from({ length: rule.monthDay - 27 }, (_, index) => index + 28).join(',')}`,
        'BYSETPOS=-1'
      );
    } else parts.push(`BYMONTHDAY=${rule.monthDay}`);
  }
  if (rule.month !== undefined) parts.push(`BYMONTH=${rule.month}`);
  if (rule.end.type === 'count') parts.push(`COUNT=${rule.end.count}`);
  if (rule.end.type === 'until') {
    const until = anchor.allDay
      ? rule.end.date.replaceAll('-', '')
      : Temporal.PlainDate.from(rule.end.date)
          .toPlainDateTime('23:59:59')
          .toZonedDateTime(rule.timeZone)
          .toInstant()
          .toString()
          .replaceAll('-', '')
          .replaceAll(':', '');
    parts.push(`UNTIL=${until}`);
  }
  return [`RRULE:${parts.join(';')}`];
}

/** Richer Google RRULE/RDATE/EXDATE data must be retained read-only, never dropped. */
export function fromGoogleCalendarRecurrence(
  value: string[],
  anchor: CalendarRecurrenceAnchor,
  timeZone: string
): CalendarRecurrenceRule {
  if (value.length !== 1 || !value[0]?.startsWith('RRULE:'))
    throw new UnsupportedCalendarRecurrenceError(
      'Only one common RRULE is editable; retain original provider recurrence'
    );
  const entries = value[0]
    .slice(6)
    .split(';')
    .map((part) => part.split('='));
  if (
    entries.some((parts) => parts.length !== 2) ||
    new Set(entries.map(([key]) => key)).size !== entries.length
  )
    throw new UnsupportedCalendarRecurrenceError(
      'Malformed or duplicate RRULE fields'
    );
  const fields = Object.fromEntries(entries) as Record<string, string>;
  if (
    Object.keys(fields).some(
      (key) =>
        ![
          'FREQ',
          'INTERVAL',
          'WKST',
          'BYDAY',
          'BYSETPOS',
          'BYMONTHDAY',
          'BYMONTH',
          'COUNT',
          'UNTIL',
        ].includes(key)
    )
  )
    throw new UnsupportedCalendarRecurrenceError('Unsupported RRULE selectors');
  if (fields.COUNT && fields.UNTIL)
    throw new UnsupportedCalendarRecurrenceError(
      'COUNT and UNTIL are mutually exclusive'
    );
  const frequency = fields.FREQ?.toLowerCase();
  const byday = fields.BYDAY?.split(',').map((value) => {
    const match = /^(-1|[1-4])?(MO|TU|WE|TH|FR|SA|SU)$/.exec(value);
    if (!match)
      throw new UnsupportedCalendarRecurrenceError('Unsupported BYDAY');
    return {
      day: match[2] as CalendarWeekday,
      index: match[1] ? Number(match[1]) : undefined,
    };
  });
  const index = byday?.[0]?.index;
  if (index !== undefined && frequency !== 'monthly' && frequency !== 'yearly')
    throw new UnsupportedCalendarRecurrenceError(
      'Ordinal weekdays require monthly or yearly recurrence'
    );
  const monthDays = fields.BYMONTHDAY?.split(',').map(Number);
  const clampsMonthDay =
    !byday &&
    fields.BYSETPOS === '-1' &&
    Boolean(
      monthDays &&
        monthDays.length > 1 &&
        monthDays.every((day, i) => day === 28 + i) &&
        monthDays.at(-1)! <= 31
    );
  if (
    byday?.some((day) => day.index !== index) ||
    (fields.BYSETPOS &&
      !clampsMonthDay &&
      (fields.BYSETPOS !== '1' || index === undefined)) ||
    (index !== undefined && byday!.length > 1 && fields.BYSETPOS !== '1')
  )
    throw new UnsupportedCalendarRecurrenceError(
      'Relative RRULE is not representable by Graph'
    );
  const number = (value: string | undefined, fallback?: number) => {
    if (value === undefined) return fallback;
    if (!/^\d+$/.test(value))
      throw new UnsupportedCalendarRecurrenceError(
        'Invalid numeric RRULE field'
      );
    return Number(value);
  };
  let end: CalendarRecurrenceRule['end'] = { type: 'never' };
  if (fields.COUNT) end = { type: 'count', count: number(fields.COUNT)! };
  if (fields.UNTIL) {
    let date: Temporal.PlainDate;
    if (anchor.allDay && /^\d{8}$/.test(fields.UNTIL))
      date = Temporal.PlainDate.from(
        `${fields.UNTIL.slice(0, 4)}-${fields.UNTIL.slice(4, 6)}-${fields.UNTIL.slice(6)}`
      );
    else if (!anchor.allDay && /^\d{8}T\d{6}Z$/.test(fields.UNTIL)) {
      const raw = fields.UNTIL;
      const cutoff = Temporal.Instant.from(
        `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}Z`
      );
      date = cutoff.toZonedDateTimeISO(timeZone).toPlainDate();
      const slot = date
        .toPlainDateTime(
          Temporal.PlainDateTime.from(anchor.startLocal).toPlainTime()
        )
        .toZonedDateTime(timeZone)
        .toInstant();
      if (Temporal.Instant.compare(slot, cutoff) > 0)
        date = date.subtract({ days: 1 });
    } else
      throw new UnsupportedCalendarRecurrenceError('Invalid UNTIL date type');
    end = { type: 'until', date: date.toString() };
  }
  const anchorDate = Temporal.PlainDateTime.from(
    anchor.startLocal
  ).toPlainDate();
  const rule = CalendarRecurrenceRuleSchema.parse({
    version: 1,
    frequency,
    interval: number(fields.INTERVAL, 1),
    timeZone,
    ...(frequency === 'weekly'
      ? {
          weekdays: byday?.map((day) => day.day) ?? [
            CALENDAR_WEEKDAYS[anchorDate.dayOfWeek - 1],
          ],
          weekStartsOn: fields.WKST ?? 'MO',
        }
      : byday
        ? { weekdays: byday.map((day) => day.day), weekIndex: index }
        : {}),
    ...(fields.BYMONTHDAY
      ? clampsMonthDay
        ? { monthDay: monthDays!.at(-1), monthDayOverflow: 'last-day' }
        : { monthDay: number(fields.BYMONTHDAY) }
      : !byday && ['monthly', 'yearly'].includes(frequency ?? '')
        ? { monthDay: anchorDate.day }
        : {}),
    ...(frequency === 'yearly'
      ? { month: number(fields.BYMONTH, anchorDate.month) }
      : fields.BYMONTH
        ? { month: number(fields.BYMONTH) }
        : {}),
    end,
  });
  validateCalendarRecurrence(rule, anchor);
  return rule;
}
