import dayjs from 'dayjs';
import '@/lib/dayjs-setup';

export interface UserGroupScheduleOccurrence {
  endsAt: string;
  groupId: string;
  startsAt: string;
}

export interface UserGroupSchedulePatternSummary {
  daysOfWeek: number[];
  endTime: string;
  exceptionCount: number;
  expectedCount: number;
  occurrenceCount: number;
  startTime: string;
}

export interface UserGroupScheduleSummary {
  exceptionCount: number;
  patterns: UserGroupSchedulePatternSummary[];
  upcomingCount: number;
}

interface ScheduleBucket {
  dates: Set<string>;
  daysOfWeek: Set<number>;
  endTime: string;
  startTime: string;
}

const DEFAULT_PATTERN_LIMIT = 3;
const SUMMARY_DAYS = 28;

function localDateKey(value: string, timezone: string) {
  return dayjs(value).tz(timezone).format('YYYY-MM-DD');
}

function countExpectedOccurrences({
  daysOfWeek,
  from,
  to,
}: {
  daysOfWeek: number[];
  from: dayjs.Dayjs;
  to: dayjs.Dayjs;
}) {
  const days = new Set(daysOfWeek);
  let count = 0;

  for (
    let cursor = from.startOf('day');
    cursor.isBefore(to, 'day');
    cursor = cursor.add(1, 'day')
  ) {
    if (days.has(cursor.day())) count += 1;
  }

  return count;
}

export function summarizeNextFourWeekSchedule({
  from,
  occurrences,
  patternLimit = DEFAULT_PATTERN_LIMIT,
  timezone,
}: {
  from: string;
  occurrences: UserGroupScheduleOccurrence[];
  patternLimit?: number;
  timezone: string;
}): UserGroupScheduleSummary {
  const rangeStart = dayjs(from).tz(timezone).startOf('day');
  const rangeEnd = rangeStart.add(SUMMARY_DAYS, 'day');
  const buckets = new Map<string, ScheduleBucket>();
  let upcomingCount = 0;

  for (const occurrence of occurrences) {
    const startsAt = dayjs(occurrence.startsAt).tz(timezone);
    if (startsAt.isBefore(rangeStart) || !startsAt.isBefore(rangeEnd)) {
      continue;
    }

    const endsAt = dayjs(occurrence.endsAt).tz(timezone);
    const startTime = startsAt.format('HH:mm');
    const endTime = endsAt.format('HH:mm');
    const key = `${startTime}-${endTime}`;
    const bucket =
      buckets.get(key) ??
      ({
        dates: new Set<string>(),
        daysOfWeek: new Set<number>(),
        endTime,
        startTime,
      } satisfies ScheduleBucket);

    bucket.dates.add(localDateKey(occurrence.startsAt, timezone));
    bucket.daysOfWeek.add(startsAt.day());
    buckets.set(key, bucket);
    upcomingCount += 1;
  }

  const candidates = Array.from(buckets.values())
    .map((bucket) => {
      const daysOfWeek = Array.from(bucket.daysOfWeek).sort((a, b) => a - b);
      const occurrenceCount = bucket.dates.size;
      const expectedCount = countExpectedOccurrences({
        daysOfWeek,
        from: rangeStart,
        to: rangeEnd,
      });

      return {
        daysOfWeek,
        endTime: bucket.endTime,
        exceptionCount: Math.max(expectedCount - occurrenceCount, 0),
        expectedCount,
        occurrenceCount,
        startTime: bucket.startTime,
      } satisfies UserGroupSchedulePatternSummary;
    })
    .filter((pattern) => pattern.occurrenceCount >= 2)
    .sort(
      (a, b) =>
        b.occurrenceCount - a.occurrenceCount ||
        a.startTime.localeCompare(b.startTime) ||
        a.endTime.localeCompare(b.endTime)
    );

  const patterns = candidates.slice(0, patternLimit);
  const patternedCount = patterns.reduce(
    (total, pattern) => total + pattern.occurrenceCount,
    0
  );
  const patternExceptionCount = patterns.reduce(
    (total, pattern) => total + pattern.exceptionCount,
    0
  );

  return {
    exceptionCount: patternExceptionCount + (upcomingCount - patternedCount),
    patterns,
    upcomingCount,
  };
}
