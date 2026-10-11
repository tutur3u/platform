import { Temporal } from '@js-temporal/polyfill';

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type HoursInterval = Readonly<{ start: string; end: string }>;
/** Missing weekday means unknown for staff defaults and inheritance for overrides. */
export type HoursWeek = Partial<Record<Weekday, readonly HoursInterval[]>>;
/** Opaque storage receipt. Never parse through Number or Date. */
export type HoursRevision = string;
export type ConfirmedHoursFrame = Readonly<{
  timeZone: string;
  confirmed: true;
}>;
export type StaffHours = Readonly<{
  revision: HoursRevision;
  frame: ConfirmedHoursFrame;
  week: HoursWeek;
}>;
export type TeacherHoursOverride = Readonly<{
  revision: HoursRevision;
  week: HoursWeek;
}>;
export type EffectiveHoursDay = Readonly<{
  day: Weekday;
  source: 'default' | 'override' | 'unknown';
  state: 'hours' | 'closed' | 'unknown';
  intervals: readonly HoursInterval[];
}>;
const weekdays: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

function minute(value: string, end = false): number {
  if (end && value === '24:00') return 1440;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error('Invalid teacher-hours clock');
  }
  const [hour, minutes] = value.split(':').map(Number);
  return hour! * 60 + minutes!;
}

export function validateHoursRevision(revision: HoursRevision): void {
  if (
    typeof revision !== 'string' ||
    !revision.trim() ||
    revision.length > 512
  ) {
    throw new Error('Invalid teacher-hours revision');
  }
}

export function validateHoursFrame(frame: ConfirmedHoursFrame): void {
  if (
    frame?.confirmed !== true ||
    typeof frame.timeZone !== 'string' ||
    frame.timeZone === 'auto' ||
    /^[+-]/.test(frame.timeZone)
  ) {
    throw new Error('Teacher-hours timezone must be explicitly confirmed');
  }
  // Intl rejects non-IANA identifiers; UTC and recognized IANA aliases are valid.
  new Intl.DateTimeFormat('en', { timeZone: frame.timeZone }).format(0);
}

export function validateHoursWeek(week: HoursWeek): void {
  if (!week || typeof week !== 'object' || Array.isArray(week)) {
    throw new Error('Invalid teacher-hours week');
  }
  for (const [key, intervals] of Object.entries(week)) {
    if (
      !/^[1-7]$/.test(key) ||
      !Array.isArray(intervals) ||
      intervals.length > 24
    ) {
      throw new Error('Invalid teacher-hours weekday');
    }
    let previousEnd = -1;
    for (const interval of intervals) {
      if (
        !interval ||
        typeof interval !== 'object' ||
        Array.isArray(interval) ||
        Object.keys(interval).length !== 2 ||
        typeof interval.start !== 'string' ||
        typeof interval.end !== 'string'
      )
        throw new Error('Invalid teacher-hours interval shape');
      const start = minute(interval.start);
      const end = minute(interval.end, true);
      if (end <= start || start < previousEnd) {
        throw new Error('Teacher-hours intervals must be sorted and disjoint');
      }
      previousEnd = end;
    }
  }
}

export function resolveTeacherHours(
  defaults: StaffHours | null,
  override: TeacherHoursOverride | null
): readonly EffectiveHoursDay[] {
  if (defaults) {
    validateHoursRevision(defaults.revision);
    validateHoursFrame(defaults.frame);
    validateHoursWeek(defaults.week);
  }
  if (override) {
    validateHoursRevision(override.revision);
    validateHoursWeek(override.week);
  }
  return weekdays.map((day) => {
    const own = override?.week[day];
    const inherited = defaults?.week[day];
    // An override cannot establish an unconfirmed/missing staff timezone frame.
    const intervals = defaults ? (own ?? inherited) : undefined;
    return {
      day,
      source:
        intervals === undefined ? 'unknown' : own ? 'override' : 'default',
      state:
        intervals === undefined
          ? 'unknown'
          : intervals.length
            ? 'hours'
            : 'closed',
      intervals: intervals?.map((interval) => ({ ...interval })) ?? [],
    };
  });
}

/** Pure receipt validation, not a database CAS or authorization implementation. */
export function validateHoursWriteReceipt(
  expectedRevision: HoursRevision | null,
  returnedRevision: HoursRevision
): void {
  if (expectedRevision !== null) validateHoursRevision(expectedRevision);
  validateHoursRevision(returnedRevision);
  if (expectedRevision === returnedRevision) {
    throw new Error('Teacher-hours write did not advance its revision');
  }
}

/** Reset is a revisioned empty override, never deletion back to an absent row. */
export function resetTeacherHoursOverride(
  expectedRevision: HoursRevision | null,
  returnedRevision: HoursRevision
): TeacherHoursOverride {
  validateHoursWriteReceipt(expectedRevision, returnedRevision);
  return { revision: returnedRevision, week: {} };
}

export type HoursSlot = Readonly<{
  date: string;
  start: string;
  endDate: string;
  end: string;
}>;
export type HoursSlotDecision =
  | Readonly<{ state: 'allowed'; startInstant: string; endInstant: string }>
  | Readonly<{ state: 'closed' | 'unknown' | 'invalid' }>;

/**
 * Staff-clock slot only: callers must convert other source frames explicitly.
 * Reject DST gaps/folds and transition-crossing slots rather than choosing offsets.
 * Overnight hours are represented explicitly on both weekdays; no inferred widening.
 */
export function assessTeacherHoursSlot(
  defaults: StaffHours | null,
  override: TeacherHoursOverride | null,
  slot: HoursSlot
): HoursSlotDecision {
  if (!defaults) return { state: 'unknown' };
  try {
    const week = resolveTeacherHours(defaults, override);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(slot.date) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(slot.endDate)
    ) {
      return { state: 'invalid' };
    }
    minute(slot.start);
    minute(slot.end);
    const start = Temporal.PlainDateTime.from(`${slot.date}T${slot.start}`);
    const end = Temporal.PlainDateTime.from(`${slot.endDate}T${slot.end}`);
    const civilMinutes = start.until(end, { largestUnit: 'minutes' }).minutes;
    if (civilMinutes <= 0 || civilMinutes > 7 * 1440)
      return { state: 'invalid' };
    const zone = defaults.frame.timeZone;
    const startZoned = start.toZonedDateTime(zone, {
      disambiguation: 'reject',
    });
    const endZoned = end.toZonedDateTime(zone, { disambiguation: 'reject' });
    if (
      endZoned.epochMilliseconds - startZoned.epochMilliseconds !==
      civilMinutes * 60_000
    ) {
      return { state: 'invalid' };
    }
    let date = start.toPlainDate();
    let unknown = false;
    let closed = false;
    while (Temporal.PlainDate.compare(date, end.toPlainDate()) <= 0) {
      const sameStart =
        Temporal.PlainDate.compare(date, start.toPlainDate()) === 0;
      const sameEnd = Temporal.PlainDate.compare(date, end.toPlainDate()) === 0;
      const from = sameStart ? minute(slot.start) : 0;
      const to = sameEnd ? minute(slot.end) : 1440;
      if (from < to) {
        const day = week[date.dayOfWeek - 1]!;
        if (day.state === 'unknown') unknown = true;
        else {
          let covered = from;
          for (const interval of day.intervals) {
            if (minute(interval.start) > covered) break;
            covered = Math.max(covered, minute(interval.end, true));
          }
          if (covered < to) closed = true;
        }
      }
      date = date.add({ days: 1 });
    }
    if (closed) return { state: 'closed' };
    if (unknown) return { state: 'unknown' };
    return {
      state: 'allowed',
      startInstant: startZoned.toInstant().toString(),
      endInstant: endZoned.toInstant().toString(),
    };
  } catch {
    return { state: 'invalid' };
  }
}
