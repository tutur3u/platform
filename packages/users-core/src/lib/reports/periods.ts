export const REPORT_CADENCES = [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
] as const;

export type ReportCadence = (typeof REPORT_CADENCES)[number];

export interface CalendarReportPeriod {
  cadence: ReportCadence;
  end: string;
  label: string;
  start: string;
}

interface CalendarDate {
  day: number;
  month: number;
  year: number;
}

function getCalendarDate(date: Date, timezone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );

  if (!values.year || !values.month || !values.day) {
    throw new Error(`Unable to resolve calendar date for ${timezone}`);
  }

  return {
    day: values.day,
    month: values.month,
    year: values.year,
  };
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function fromCalendarDate({ day, month, year }: CalendarDate) {
  return new Date(Date.UTC(year, month - 1, day));
}

function getCompletedReferenceDate(date: Date, timezone: string) {
  const localDate = fromCalendarDate(getCalendarDate(date, timezone));
  localDate.setUTCDate(localDate.getUTCDate() - 1);
  return localDate;
}

export function assertValidReportTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  } catch {
    throw new Error(`Invalid report timezone: ${timezone}`);
  }
}

export function getCalendarReportPeriod({
  cadence,
  reference = new Date(),
  timezone,
  completed = false,
}: {
  cadence: ReportCadence;
  reference?: Date;
  timezone: string;
  completed?: boolean;
}): CalendarReportPeriod {
  assertValidReportTimezone(timezone);
  const localReference = completed
    ? getCompletedReferenceDate(reference, timezone)
    : fromCalendarDate(getCalendarDate(reference, timezone));
  const year = localReference.getUTCFullYear();
  const month = localReference.getUTCMonth();
  let start: Date;
  let end: Date;
  let label: string;

  if (cadence === 'weekly') {
    const weekday = localReference.getUTCDay();
    const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
    start = new Date(localReference);
    start.setUTCDate(start.getUTCDate() - daysSinceMonday);
    end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    label = `${toIsoDate(start)} – ${toIsoDate(end)}`;
  } else if (cadence === 'monthly') {
    start = new Date(Date.UTC(year, month, 1));
    end = new Date(Date.UTC(year, month + 1, 0));
    label = new Intl.DateTimeFormat('en', {
      month: 'long',
      timeZone: 'UTC',
      year: 'numeric',
    }).format(start);
  } else if (cadence === 'quarterly') {
    const quarter = Math.floor(month / 3);
    start = new Date(Date.UTC(year, quarter * 3, 1));
    end = new Date(Date.UTC(year, quarter * 3 + 3, 0));
    label = `Q${quarter + 1} ${year}`;
  } else {
    start = new Date(Date.UTC(year, 0, 1));
    end = new Date(Date.UTC(year, 11, 31));
    label = String(year);
  }

  return {
    cadence,
    end: toIsoDate(end),
    label,
    start: toIsoDate(start),
  };
}

export function getNextReportPeriodStart(
  period: Pick<CalendarReportPeriod, 'end'>
) {
  const date = new Date(`${period.end}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return toIsoDate(date);
}

function getZonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );

  if (
    !values.year ||
    !values.month ||
    !values.day ||
    values.hour === undefined ||
    values.minute === undefined ||
    values.second === undefined
  ) {
    throw new Error(`Unable to resolve wall-clock time for ${timezone}`);
  }

  return values as unknown as CalendarDate & {
    hour: number;
    minute: number;
    second: number;
  };
}

export function reportLocalTimeToUtc({
  date,
  time,
  timezone,
}: {
  date: string;
  time: string;
  timezone: string;
}) {
  assertValidReportTimezone(timezone);
  const [year, month, day] = date.split('-').map(Number);
  const [hour = 0, minute = 0, second = 0] = time.split(':').map(Number);
  if (!year || !month || !day) throw new Error('Invalid report date');
  const desiredWallClock = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = new Date(desiredWallClock);

  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = getZonedParts(candidate, timezone);
    const observedWallClock = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const difference = desiredWallClock - observedWallClock;
    if (difference === 0) return candidate;
    candidate = new Date(candidate.getTime() + difference);
  }

  return candidate;
}
