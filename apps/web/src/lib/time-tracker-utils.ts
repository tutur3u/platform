import type { TimeTrackingSession } from '@tuturuuu/types/db';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

type SessionLike = Pick<TimeTrackingSession, 'start_time' | 'end_time'>;

type ProjectContextSession = Pick<TimeTrackingSession, 'task_id'> & {
  category?: {
    name?: string | null;
  } | null;
};

type PeriodSession = SessionLike & {
  id: string;
  title: string;
  duration_seconds: number | null;
  category?: {
    id: string;
    name: string;
    color: string | null;
  } | null;
};

type SessionWithPeriodDuration = {
  session: PeriodSession;
  periodDuration: number;
  timeOfDay: string;
};

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
  session: SessionLike,
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
  session: SessionLike,
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
  startTime: string,
  userTimezone: string
): 'morning' | 'afternoon' | 'evening' | 'night' => {
  const hour = dayjs.utc(startTime).tz(userTimezone).hour();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 24) return 'evening';
  return 'night';
};

export const getProjectContextCategory = (
  session: ProjectContextSession
): 'general' | 'project-work' | 'meetings' | 'learning' | 'administrative' => {
  if (session.task_id) return 'project-work';
  const categoryName = session.category?.name?.toLowerCase() || '';
  if (categoryName.includes('meeting')) return 'meetings';
  if (categoryName.includes('learn')) return 'learning';
  if (categoryName.includes('admin')) return 'administrative';
  return 'general';
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

const getOverlapSeconds = (
  session: SessionLike,
  periodStart: dayjs.Dayjs,
  periodEnd: dayjs.Dayjs,
  userTimezone: string
): number => {
  const sessionStart = dayjs.utc(session.start_time).tz(userTimezone);
  const sessionEnd = session.end_time
    ? dayjs.utc(session.end_time).tz(userTimezone)
    : dayjs().tz(userTimezone);

  const clampedStart = sessionStart.isAfter(periodStart)
    ? sessionStart
    : periodStart;
  const clampedEnd = sessionEnd.isBefore(periodEnd) ? sessionEnd : periodEnd;

  return Math.max(0, clampedEnd.diff(clampedStart, 'second'));
};

const buildSessionsWithPeriodDuration = (
  sessionsList: PeriodSession[],
  startOfPeriod: dayjs.Dayjs,
  endOfPeriod: dayjs.Dayjs,
  userTimezone: string
): SessionWithPeriodDuration[] =>
  sessionsList.map((session) => ({
    session,
    periodDuration: getSessionDurationInPeriod(
      session,
      startOfPeriod,
      endOfPeriod,
      userTimezone
    ),
    timeOfDay: getTimeOfDayCategory(session.start_time, userTimezone),
  }));

const computeTimeOfDayBreakdown = (
  sessionsWithPeriodDuration: SessionWithPeriodDuration[]
): PeriodStats['timeOfDayBreakdown'] =>
  sessionsWithPeriodDuration.reduce(
    (acc, { timeOfDay }) => {
      acc[timeOfDay as keyof PeriodStats['timeOfDayBreakdown']] += 1;
      return acc;
    },
    {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0,
    }
  );

const computeDurationBuckets = (
  sessionsWithPeriodDuration: SessionWithPeriodDuration[]
): Pick<PeriodStats, 'shortSessions' | 'mediumSessions' | 'longSessions'> => {
  let shortSessions = 0;
  let mediumSessions = 0;
  let longSessions = 0;

  sessionsWithPeriodDuration.forEach(({ periodDuration }) => {
    if (periodDuration <= 0) return;
    if (periodDuration < 1800) {
      shortSessions += 1;
      return;
    }
    if (periodDuration < 7200) {
      mediumSessions += 1;
      return;
    }
    longSessions += 1;
  });

  return { shortSessions, mediumSessions, longSessions };
};

const computeCategoryBreakdown = (
  sessionsWithPeriodDuration: SessionWithPeriodDuration[]
): PeriodStats['breakdown'] => {
  const categoryDurations: {
    [id: string]: { name: string; duration: number; color: string };
  } = {};

  sessionsWithPeriodDuration.forEach(({ session, periodDuration }) => {
    const id = session.category?.id || 'uncategorized';
    const name = session.category?.name || 'No Category';
    const color = session.category?.color || 'GRAY';

    if (!categoryDurations[id]) {
      categoryDurations[id] = { name, duration: 0, color };
    }
    categoryDurations[id].duration += periodDuration;
  });

  return Object.values(categoryDurations)
    .filter((c) => c.duration > 0)
    .sort((a, b) => b.duration - a.duration);
};

const computeLongestSession = (
  sessionsList: PeriodSession[],
  startOfPeriod: dayjs.Dayjs,
  endOfPeriod: dayjs.Dayjs,
  userTimezone: string
): PeriodSession | null => {
  if (sessionsList.length === 0) return null;
  const initialSession = sessionsList[0];
  if (!initialSession) return null;

  const { session, overlapSeconds } = sessionsList.reduce<{
    session: PeriodSession;
    overlapSeconds: number;
  }>(
    (current, nextSession) => {
      const nextOverlap = getOverlapSeconds(
        nextSession,
        startOfPeriod,
        endOfPeriod,
        userTimezone
      );

      return nextOverlap > current.overlapSeconds
        ? { session: nextSession, overlapSeconds: nextOverlap }
        : current;
    },
    {
      session: initialSession,
      overlapSeconds: getOverlapSeconds(
        initialSession,
        startOfPeriod,
        endOfPeriod,
        userTimezone
      ),
    }
  );

  return { ...session, duration_seconds: overlapSeconds };
};

export const calculatePeriodStats = (
  sessionsForPeriod: PeriodSession[] | undefined,
  startOfPeriod: dayjs.Dayjs,
  endOfPeriod: dayjs.Dayjs,
  userTimezone: string
): PeriodStats => {
  // Normalize sessions array to avoid undefined lengths producing undefined counts
  const sessionsList = sessionsForPeriod ?? [];
  const sessionsWithPeriodDuration = buildSessionsWithPeriodDuration(
    sessionsList,
    startOfPeriod,
    endOfPeriod,
    userTimezone
  );

  const totalDuration = sessionsWithPeriodDuration.reduce(
    (sum, { periodDuration }) => sum + periodDuration,
    0
  );

  const timeOfDayBreakdown = computeTimeOfDayBreakdown(
    sessionsWithPeriodDuration
  );

  const bestTimeOfDay =
    sessionsList.length > 0
      ? Object.entries(timeOfDayBreakdown).reduce<[string, number]>(
          (a, b) => (a[1] > b[1] ? a : b),
          ['morning', 0]
        )[0]
      : 'none';

  const longestSession = computeLongestSession(
    sessionsList,
    startOfPeriod,
    endOfPeriod,
    userTimezone
  );

  const { shortSessions, mediumSessions, longSessions } =
    computeDurationBuckets(sessionsWithPeriodDuration);

  const breakdown = computeCategoryBreakdown(sessionsWithPeriodDuration);

  return {
    totalDuration,
    breakdown,
    timeOfDayBreakdown,
    bestTimeOfDay,
    longestSession: longestSession || null,
    shortSessions,
    mediumSessions,
    longSessions,
    sessionCount: sessionsList.length,
  };
};
