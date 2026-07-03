/**
 * Timezone utilities (Intl-based, no external deps)
 *
 * Goal: convert wall-clock times in an IANA timezone to UTC instants in a way
 * that is stable across server environments (server may run in UTC).
 *
 * NOTE: We intentionally avoid relying on the host machine timezone.
 */
export type ZonedDateTimeParts = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second?: number; // 0-59
};

export type ZonedDateParts = Pick<ZonedDateTimeParts, 'year' | 'month' | 'day'>;

const DEFAULT_LOCALE = 'en-US';

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function requireValidTimeZone(tz: string): string {
  if (!isValidTimeZone(tz)) {
    throw new Error(`Invalid timeZone: ${tz}`);
  }
  return tz;
}

function toUtcMinutes(parts: ZonedDateTimeParts): number {
  return Math.floor(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second ?? 0
    ) / 60000
  );
}

export function getZonedDateTimeParts(
  date: Date,
  tz: string
): ZonedDateTimeParts {
  const timeZone = requireValidTimeZone(tz);
  const formatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((p) => p.type === type)?.value;
    return Number.parseInt(value ?? '0', 10);
  };

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

export function getZonedDateParts(date: Date, tz: string): ZonedDateParts {
  const p = getZonedDateTimeParts(date, tz);
  return { year: p.year, month: p.month, day: p.day };
}

/**
 * Convert a wall-clock time in a timezone into a UTC Date (instant).
 *
 * Implementation: iterative correction using Intl.formatToParts to measure
 * the delta between desired wall time and the wall time produced by the guess.
 * This converges quickly (usually 1-2 passes) and works regardless of host TZ.
 */
export function zonedDateTimeToUtc(
  parts: ZonedDateTimeParts,
  tz: string
): Date {
  const timeZone = requireValidTimeZone(tz);

  let guessMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0,
    0
  );

  // Two correction passes are enough in practice for DST edges.
  for (let i = 0; i < 3; i++) {
    const actual = getZonedDateTimeParts(new Date(guessMs), timeZone);
    const diffMinutes = toUtcMinutes(parts) - toUtcMinutes(actual);
    if (diffMinutes === 0) break;
    guessMs += diffMinutes * 60_000;
  }

  return new Date(guessMs);
}

export function startOfZonedDayUtc(now: Date, tz: string): Date {
  const ymd = getZonedDateParts(now, tz);
  return zonedDateTimeToUtc({ ...ymd, hour: 0, minute: 0, second: 0 }, tz);
}

function addDaysToYmd(ymd: ZonedDateParts, days: number): ZonedDateParts {
  // Use UTC noon for normalization safety (UTC has no DST).
  const d = new Date(
    Date.UTC(ymd.year, ymd.month - 1, ymd.day + days, 12, 0, 0)
  );
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

export function addZonedDaysUtc(base: Date, tz: string, days: number): Date {
  const ymd = getZonedDateParts(base, tz);
  const next = addDaysToYmd(ymd, days);
  return zonedDateTimeToUtc({ ...next, hour: 0, minute: 0, second: 0 }, tz);
}

/**
 * Returns weekday number in the target timezone: 0=Sunday ... 6=Saturday.
 */
export function getZonedWeekday(date: Date, tz: string): number {
  const timeZone = requireValidTimeZone(tz);
  const formatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone,
    weekday: 'short',
  });
  const weekday = formatter.format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}
