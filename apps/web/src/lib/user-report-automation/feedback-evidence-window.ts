import {
  assertValidReportTimezone,
  getNextReportPeriodStart,
  reportLocalTimeToUtc,
} from '@tuturuuu/users-core/lib/reports/periods';

function validCivilDate(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith('0000')
  )
    return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function localMidnight(date: string, timezone: string) {
  const instant = reportLocalTimeToUtc({ date, time: '00:00:00', timezone });
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );
  if (
    `${values.year?.padStart(4, '0')}-${values.month}-${values.day}` !== date ||
    values.hour !== '00' ||
    values.minute !== '00' ||
    values.second !== '00'
  ) {
    throw new Error('Report local midnight is unavailable');
  }
  return instant.toISOString();
}

export type FeedbackEvidenceWindow =
  | { status: 'ready'; startInclusive: string; endExclusive: string }
  | {
      status: 'unavailable';
      reason:
        | 'invalid_period'
        | 'timezone_unavailable'
        | 'period_boundary_unavailable';
    };

/** Current workspace timezone interprets supplied civil dates, not a historical zone snapshot. */
export function resolveFeedbackEvidenceWindow(
  periodStart: unknown,
  periodEnd: unknown,
  timezone: unknown
): FeedbackEvidenceWindow {
  if (
    !validCivilDate(periodStart) ||
    !validCivilDate(periodEnd) ||
    periodEnd < periodStart
  ) {
    return { status: 'unavailable', reason: 'invalid_period' };
  }
  if (typeof timezone !== 'string' || !timezone.trim()) {
    return { status: 'unavailable', reason: 'timezone_unavailable' };
  }
  try {
    assertValidReportTimezone(timezone);
  } catch {
    return { status: 'unavailable', reason: 'timezone_unavailable' };
  }
  const nextDay = getNextReportPeriodStart({ end: periodEnd });
  if (!validCivilDate(nextDay))
    return { status: 'unavailable', reason: 'invalid_period' };
  try {
    const startInclusive = localMidnight(periodStart, timezone);
    const endExclusive = localMidnight(nextDay, timezone);
    if (endExclusive <= startInclusive)
      throw new Error('Report window is empty');
    return { status: 'ready', startInclusive, endExclusive };
  } catch {
    return { status: 'unavailable', reason: 'period_boundary_unavailable' };
  }
}

/** PostgreSQL microsecond timestamps: compare instants without losing sub-ms ordering. */
export function parseFeedbackTimestampInstant(value: unknown): bigint | null {
  if (typeof value !== 'string') return null;
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value
    );
  if (!match) return null;
  const [, date, hour, minute, second, fraction = '', zone] = match;
  const civil = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(civil.getTime()) ||
    civil.toISOString().slice(0, 10) !== date ||
    date?.startsWith('0000') ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  )
    return null;
  const milliseconds = Date.parse(`${date}T${hour}:${minute}:${second}${zone}`);
  return Number.isFinite(milliseconds)
    ? BigInt(milliseconds) * 1000n + BigInt(fraction.padEnd(6, '0'))
    : null;
}
