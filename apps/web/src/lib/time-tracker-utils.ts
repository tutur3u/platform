import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

/**
 * Calculate how much of a session's duration falls within a specific date range.
 * This properly handles overnight sessions that span multiple days/periods.
 *
 * @param session - The session to calculate duration for
 * @param periodStart - Start of the period (inclusive)
 * @param periodEnd - End of the period (inclusive)
 * @param userTimezone - User's timezone for calculations
 * @returns Duration in seconds that falls within the period
 */
export const getSessionDurationInPeriod = (
  session: {
    start_time: string;
    end_time: string | null;
  },
  periodStart: dayjs.Dayjs,
  periodEnd: dayjs.Dayjs,
  userTimezone: string
): number => {
  const sessionStart = dayjs.utc(session.start_time).tz(userTimezone);
  const sessionEnd = session.end_time
    ? dayjs.utc(session.end_time).tz(userTimezone)
    : dayjs().tz(userTimezone); // Use current time for running sessions

  // If session doesn't overlap with the period at all, return 0
  if (sessionEnd.isBefore(periodStart) || sessionStart.isAfter(periodEnd)) {
    return 0;
  }

  // Calculate the effective start and end within the period
  const effectiveStart = sessionStart.isBefore(periodStart)
    ? periodStart
    : sessionStart;
  const effectiveEnd = sessionEnd.isAfter(periodEnd) ? periodEnd : sessionEnd;

  // Calculate duration in seconds
  return Math.max(0, effectiveEnd.diff(effectiveStart, 'second'));
};

/**
 * Calculate how much of a session's duration falls within a specific day.
 * This is a convenience wrapper around getSessionDurationInPeriod for day-level calculations.
 *
 * @param session - The session to calculate duration for
 * @param date - The date to calculate duration for (as dayjs object in user timezone)
 * @param userTimezone - User's timezone for calculations
 * @returns Duration in seconds that falls within the specified day
 */
export const getSessionDurationForDay = (
  session: {
    start_time: string;
    end_time: string | null;
  },
  date: dayjs.Dayjs,
  userTimezone: string
): number => {
  const dayStart = date.startOf('day');
  const dayEnd = date.endOf('day');
  return getSessionDurationInPeriod(session, dayStart, dayEnd, userTimezone);
};

/**
 * Get the time of day category for a session (morning, afternoon, evening, night)
 */
export const getTimeOfDayCategory = (
  session: {
    start_time: string;
  },
  userTimezone: string
): string => {
  const hour = dayjs.utc(session.start_time).tz(userTimezone).hour();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 24) return 'evening';
  return 'night';
};

/**
 * Get the duration category for a session (short, medium, long)
 */
export const getDurationCategory = (session: {
  duration_seconds: number | null;
}): string => {
  const duration = session.duration_seconds || 0;
  if (duration < 1800) return 'short'; // < 30 min
  if (duration < 7200) return 'medium'; // 30 min - 2 hours
  return 'long'; // 2+ hours
};

/**
 * Calculate period statistics for a set of sessions.
 */
export interface PeriodStats {
  totalDuration: number;
  breakdown: { name: string; duration: number; color: string }[];
  timeOfDayBreakdown: {
    morning: number;
    afternoon: number;
    evening: number;
    night: number;
  };
  bestTimeOfDay: string;
  longestSession: {
    title: string;
    duration_seconds: number | null;
  } | null;
  shortSessions: number;
  mediumSessions: number;
  longSessions: number;
  sessionCount: number;
}

export const calculatePeriodStats = (
  sessionsForPeriod:
    | {
        id: string;
        title: string;
        start_time: string;
        end_time: string | null;
        duration_seconds: number | null;
        category?: {
          id: string;
          name: string;
          color: string | null;
        } | null;
      }[]
    | undefined,
  startOfPeriod: dayjs.Dayjs,
  endOfPeriod: dayjs.Dayjs,
  userTimezone: string
): PeriodStats => {
  // Calculate total duration using only the portion that falls within the period
  const totalDuration =
    sessionsForPeriod?.reduce(
      (sum, s) =>
        sum +
        getSessionDurationInPeriod(s, startOfPeriod, endOfPeriod, userTimezone),
      0
    ) || 0;

  const categoryDurations: {
    [id: string]: { name: string; duration: number; color: string };
  } = {};

  // Normalize sessions array to avoid undefined lengths producing undefined counts
  const sessionsList = sessionsForPeriod ?? [];

  const timeOfDayBreakdown = {
    morning: sessionsList.filter(
      (s) => getTimeOfDayCategory(s, userTimezone) === 'morning'
    ).length,
    afternoon: sessionsList.filter(
      (s) => getTimeOfDayCategory(s, userTimezone) === 'afternoon'
    ).length,
    evening: sessionsList.filter(
      (s) => getTimeOfDayCategory(s, userTimezone) === 'evening'
    ).length,
    night: sessionsList.filter(
      (s) => getTimeOfDayCategory(s, userTimezone) === 'night'
    ).length,
  };

  const bestTimeOfDay =
    sessionsList.length > 0
      ? Object.entries(timeOfDayBreakdown).reduce<[string, number]>(
          (a, b) => (a[1] > b[1] ? a : b),
          ['morning', 0]
        )[0]
      : 'none';

  const longestSession =
    (sessionsForPeriod?.length || 0) > 0
      ? sessionsForPeriod?.reduce((longest, session) =>
          (session.duration_seconds || 0) > (longest.duration_seconds || 0)
            ? session
            : longest
        )
      : null;

  // Calculate session duration categories using the portion within the period
  const shortSessions =
    sessionsForPeriod?.filter((s) => {
      const periodDuration = getSessionDurationInPeriod(
        s,
        startOfPeriod,
        endOfPeriod,
        userTimezone
      );
      return periodDuration > 0 && periodDuration < 1800;
    }).length || 0;

  const mediumSessions =
    sessionsForPeriod?.filter((s) => {
      const periodDuration = getSessionDurationInPeriod(
        s,
        startOfPeriod,
        endOfPeriod,
        userTimezone
      );
      return periodDuration >= 1800 && periodDuration < 7200;
    }).length || 0;

  const longSessions =
    sessionsForPeriod?.filter((s) => {
      const periodDuration = getSessionDurationInPeriod(
        s,
        startOfPeriod,
        endOfPeriod,
        userTimezone
      );
      return periodDuration >= 7200;
    }).length || 0;

  // Calculate category durations using only the portion within the period
  sessionsForPeriod?.forEach((s) => {
    const id = s.category?.id || 'uncategorized';
    const name = s.category?.name || 'No Category';
    const color = s.category?.color || 'GRAY';

    if (!categoryDurations[id]) {
      categoryDurations[id] = { name, duration: 0, color };
    }
    categoryDurations[id].duration += getSessionDurationInPeriod(
      s,
      startOfPeriod,
      endOfPeriod,
      userTimezone
    );
  });

  const breakdown = Object.values(categoryDurations)
    .filter((c) => c.duration > 0)
    .sort((a, b) => b.duration - a.duration);

  return {
    totalDuration,
    breakdown,
    timeOfDayBreakdown,
    bestTimeOfDay,
    longestSession: longestSession || null,
    shortSessions,
    mediumSessions,
    longSessions,
    sessionCount: sessionsForPeriod?.length || 0,
  };
};
