import type { FlagValue } from './args';

type DateParts = {
  day: number;
  hour: number;
  millisecond: number;
  minute: number;
  month: number;
  second: number;
  year: number;
};

const EXPLICIT_TIME_ZONE_RE = /(?:z|[+-]\d{2}:?\d{2})$/i;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

export function inferUserTimeZone() {
  try {
    const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) return null;

    new Intl.DateTimeFormat('en', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return null;
  }
}

export function resolveCliTimeZone(value?: string) {
  if (!value) return inferUserTimeZone();
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date());
    return value;
  } catch {
    throw new Error(`Invalid --timezone value: ${value}`);
  }
}

export function pickCliTimeZone(flags: Record<string, FlagValue>) {
  const value = flags.timezone;
  return resolveCliTimeZone(typeof value === 'string' ? value : undefined);
}

export function normalizeCliDateTime(
  value: string | undefined,
  timeZone: string | null = inferUserTimeZone()
) {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed || EXPLICIT_TIME_ZONE_RE.test(trimmed)) return trimmed;

  const relative = relativeDateParts(trimmed, timeZone);
  if (relative) return localPartsToIso(relative, timeZone);

  const dateOnly = DATE_ONLY_RE.exec(trimmed);
  if (dateOnly) {
    return localPartsToIso(
      {
        year: Number(dateOnly[1]),
        month: Number(dateOnly[2]),
        day: Number(dateOnly[3]),
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
      },
      timeZone
    );
  }

  const localDateTime = LOCAL_DATE_TIME_RE.exec(trimmed);
  if (localDateTime) {
    return localPartsToIso(
      {
        year: Number(localDateTime[1]),
        month: Number(localDateTime[2]),
        day: Number(localDateTime[3]),
        hour: Number(localDateTime[4]),
        minute: Number(localDateTime[5]),
        second: Number(localDateTime[6] ?? 0),
        millisecond: Number((localDateTime[7] ?? '').padEnd(3, '0') || 0),
      },
      timeZone
    );
  }

  return trimmed;
}

function relativeDateParts(value: string, timeZone: string | null) {
  const normalized = value.toLowerCase();
  const delta =
    normalized === 'yesterday'
      ? -1
      : normalized === 'today'
        ? 0
        : normalized === 'tomorrow'
          ? 1
          : null;
  if (delta === null) return null;

  const today = getDateParts(new Date(), timeZone);
  const shifted = new Date(
    Date.UTC(today.year, today.month - 1, today.day + delta)
  );

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  };
}

export function getDateParts(date: Date, timeZone: string | null) {
  if (!timeZone) {
    return {
      day: date.getDate(),
      month: date.getMonth() + 1,
      year: date.getFullYear(),
    };
  }

  try {
    const parts = new Intl.DateTimeFormat('en', {
      day: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric',
    }).formatToParts(date);
    const getPart = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value);
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');

    if (
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      Number.isInteger(day)
    ) {
      return { day, month, year };
    }
  } catch {
    // Fall through to runtime-local values.
  }

  return {
    day: date.getDate(),
    month: date.getMonth() + 1,
    year: date.getFullYear(),
  };
}

function localPartsToIso(parts: DateParts, timeZone: string | null) {
  if (!timeZone) {
    return new Date(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond
    ).toISOString();
  }

  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond
  );
  let offset = getTimeZoneOffset(new Date(utcGuess), timeZone);
  let timestamp = utcGuess - offset;
  const nextOffset = getTimeZoneOffset(new Date(timestamp), timeZone);
  if (nextOffset !== offset) {
    offset = nextOffset;
    timestamp = utcGuess - offset;
  }

  return new Date(timestamp).toISOString();
}

function getTimeZoneOffset(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en', {
    day: '2-digit',
    fractionalSecondDigits: 3,
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const getPart = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  return (
    Date.UTC(
      getPart('year'),
      getPart('month') - 1,
      getPart('day'),
      getPart('hour'),
      getPart('minute'),
      getPart('second'),
      getPart('fractionalSecond')
    ) - date.getTime()
  );
}
