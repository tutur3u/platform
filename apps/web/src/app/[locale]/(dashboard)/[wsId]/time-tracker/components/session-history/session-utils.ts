import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { SessionWithRelations } from '../../types';
import type { StackedSession, ViewMode } from './session-types';

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
  session: SessionWithRelations,
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
  session: SessionWithRelations,
  date: dayjs.Dayjs,
  userTimezone: string
): number => {
  const dayStart = date.startOf('day');
  const dayEnd = date.endOf('day');
  return getSessionDurationInPeriod(session, dayStart, dayEnd, userTimezone);
};

/**
 * Check if a session overlaps with a given period.
 * A session overlaps if any part of it falls within the period.
 *
 * @param session - The session to check
 * @param periodStart - Start of the period
 * @param periodEnd - End of the period
 * @param userTimezone - User's timezone
 * @returns True if the session overlaps with the period
 */
export const sessionOverlapsPeriod = (
  session: SessionWithRelations,
  periodStart: dayjs.Dayjs,
  periodEnd: dayjs.Dayjs,
  userTimezone: string
): boolean => {
  const sessionStart = dayjs.utc(session.start_time).tz(userTimezone);
  const sessionEnd = session.end_time
    ? dayjs.utc(session.end_time).tz(userTimezone)
    : dayjs().tz(userTimezone); // Use current time for running sessions

  // Session overlaps if it starts before the period ends AND ends after the period starts
  return sessionStart.isBefore(periodEnd) && sessionEnd.isAfter(periodStart);
};

/**
 * Get all days that a session spans (for overnight/multi-day sessions).
 *
 * @param session - The session to get days for
 * @param userTimezone - User's timezone
 * @returns Array of date strings (YYYY-MM-DD) that the session spans
 */
export const getSessionDays = (
  session: SessionWithRelations,
  userTimezone: string
): string[] => {
  const sessionStart = dayjs.utc(session.start_time).tz(userTimezone);
  const sessionEnd = session.end_time
    ? dayjs.utc(session.end_time).tz(userTimezone)
    : dayjs().tz(userTimezone);

  const days: string[] = [];
  let current = sessionStart.startOf('day');
  const endDay = sessionEnd.startOf('day');

  while (current.isBefore(endDay) || current.isSame(endDay, 'day')) {
    days.push(current.format('YYYY-MM-DD'));
    current = current.add(1, 'day');
  }

  return days;
};

/**
 * Helper function to create a stacked session object.
 *
 * @param sessions - Sessions to stack together
 * @param userTimezone - User's timezone for duration calculations
 * @param displayDate - The date this stack is displayed under (for split overnight sessions)
 * @returns A StackedSession object or null if invalid
 */
export const createStackedSession = (
  sessions: SessionWithRelations[],
  userTimezone?: string,
  displayDate?: string
): StackedSession | null => {
  if (sessions.length === 0) {
    throw new Error('Cannot create stacked session from empty array');
  }

  const tz = userTimezone || dayjs.tz.guess();

  const totalDuration = sessions.reduce(
    (sum, s) => sum + (s.duration_seconds || 0),
    0
  );

  // Calculate period duration (duration that falls within the display date)
  let periodDuration = totalDuration;
  if (displayDate) {
    const displayDay = dayjs.tz(displayDate, tz);
    periodDuration = sessions.reduce(
      (sum, s) => sum + getSessionDurationForDay(s, displayDay, tz),
      0
    );
  }

  const sortedSessions = sessions.sort((a, b) =>
    dayjs(a.start_time).diff(dayjs(b.start_time))
  );
  const firstSession = sortedSessions[0];
  const lastSession = sortedSessions[sortedSessions.length - 1];

  if (!firstSession || !lastSession) {
    return null;
  }

  return {
    id: firstSession.id,
    title: firstSession.title,
    description: firstSession.description || undefined,
    category: firstSession.category,
    task: firstSession.task,
    sessions: sortedSessions,
    totalDuration,
    periodDuration,
    firstStartTime: firstSession.start_time,
    lastEndTime: lastSession.end_time,
    displayDate,
  };
};

/**
 * Utility function to stack sessions by day/month, name, and category.
 * For week/day view, overnight sessions are split and appear on each day they span.
 *
 * @param sessions - The sessions to stack
 * @param viewMode - The current view mode
 * @param periodStart - Start of the period (optional, for duration calculation)
 * @param periodEnd - End of the period (optional, for duration calculation)
 */
export const stackSessions = (
  sessions: SessionWithRelations[] | undefined,
  viewMode: ViewMode,
  periodStart?: dayjs.Dayjs,
  periodEnd?: dayjs.Dayjs
): StackedSession[] => {
  if (!sessions || sessions.length === 0) return [];

  const userTimezone = dayjs.tz.guess();

  // Group sessions based on view mode
  const groups: {
    [key: string]: {
      sessions: SessionWithRelations[];
      displayDate?: string;
    };
  } = {};

  sessions?.forEach((session) => {
    if (viewMode === 'month') {
      // For month view, group by name and category only (ignore day)
      const groupKey = `${session.title}-${session.category_id || 'none'}-${session.task_id || 'none'}`;
      if (!groups[groupKey]) {
        groups[groupKey] = { sessions: [] };
      }
      groups[groupKey]?.sessions.push(session);
    } else {
      // For day/week view, split sessions that span multiple days
      const sessionDays = getSessionDays(session, userTimezone);

      sessionDays.forEach((dateKey) => {
        // Check if this day falls within the period we're viewing
        const dayDate = dayjs.tz(dateKey, userTimezone);
        if (periodStart && periodEnd) {
          if (
            dayDate.isBefore(periodStart.startOf('day')) ||
            dayDate.isAfter(periodEnd.endOf('day'))
          ) {
            return; // Skip days outside the period
          }
        }

        const groupKey = `${dateKey}-${session.title}-${session.category_id || 'none'}-${session.task_id || 'none'}`;
        if (!groups[groupKey]) {
          groups[groupKey] = { sessions: [], displayDate: dateKey };
        }
        // Only add the session once per group (avoid duplicates if called multiple times)
        if (!groups[groupKey]?.sessions.some((s) => s.id === session.id)) {
          groups[groupKey]?.sessions.push(session);
        }
      });
    }
  });

  // Convert groups to stacked sessions
  const stacks: StackedSession[] = [];

  Object.values(groups).forEach((group) => {
    if (group.sessions.length > 0) {
      // Sort sessions within group by start time
      const sortedSessions = group.sessions.sort((a, b) =>
        dayjs(a.start_time).diff(dayjs(b.start_time))
      );
      const newStack = createStackedSession(
        sortedSessions,
        userTimezone,
        group.displayDate
      );
      if (newStack) stacks.push(newStack);
    }
  });

  return stacks;
};

/**
 * Get category color class based on color name.
 */
export const getCategoryColor = (color: string): string => {
  const colorMap: Record<string, string> = {
    RED: 'bg-red-500',
    BLUE: 'bg-blue-500',
    GREEN: 'bg-green-500',
    YELLOW: 'bg-yellow-500',
    ORANGE: 'bg-orange-500',
    PURPLE: 'bg-purple-500',
    PINK: 'bg-pink-500',
    INDIGO: 'bg-indigo-500',
    CYAN: 'bg-cyan-500',
    GRAY: 'bg-gray-500',
  };
  return colorMap[color] || 'bg-blue-500';
};

/**
 * Helper function to check if a session is older than the workspace threshold.
 * null threshold means no approval needed (any entry can be edited directly)
 */
export const isSessionOlderThanThreshold = (
  session: SessionWithRelations,
  thresholdDays: number | null | undefined
): boolean => {
  // If threshold is null, no approval needed - any session can be edited directly
  if (thresholdDays === null) return false;
  // If threshold is undefined (loading), treat as requiring approval (safer default)
  if (thresholdDays === undefined) return true;
  if (thresholdDays === 0) {
    // When threshold is 0, all entries require approval
    return true;
  }
  const sessionStartTime = dayjs.utc(session.start_time);
  const thresholdAgo = dayjs().utc().subtract(thresholdDays, 'day');
  return sessionStartTime.isBefore(thresholdAgo);
};

/**
 * Helper function to check if a datetime string is more than threshold days ago.
 * null threshold means no approval needed (any datetime is allowed)
 */
export const isDatetimeMoreThanThresholdAgo = (
  datetimeString: string,
  timezone: string,
  thresholdDays: number | null | undefined
): boolean => {
  if (!datetimeString) return false;
  // If threshold is null, no approval needed - any datetime is allowed
  if (thresholdDays === null) return false;
  // If threshold is undefined (loading), treat as requiring approval (safer default)
  if (thresholdDays === undefined) return true;
  if (thresholdDays === 0) return true; // All entries require approval when threshold is 0
  const datetime = dayjs.tz(datetimeString, timezone).utc();
  if (!datetime.isValid()) return false;
  const thresholdAgo = dayjs().utc().subtract(thresholdDays, 'day');
  return datetime.isBefore(thresholdAgo);
};

/**
 * Get the time of day category for a session (morning, afternoon, evening, night)
 */
export const getTimeOfDayCategory = (
  session: SessionWithRelations,
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
export const getDurationCategory = (session: SessionWithRelations): string => {
  const duration = session.duration_seconds || 0;
  if (duration < 1800) return 'short'; // < 30 min
  if (duration < 7200) return 'medium'; // 30 min - 2 hours
  return 'long'; // 2+ hours
};

/**
 * Calculate period statistics for a set of sessions.
 */
export interface PeriodStats {
  totalDuration: number | undefined;
  breakdown: { name: string; duration: number; color: string }[];
  timeOfDayBreakdown: {
    morning: number;
    afternoon: number;
    evening: number;
    night: number;
  };
  bestTimeOfDay: string;
  longestSession: SessionWithRelations | null | undefined;
  shortSessions: number | undefined;
  mediumSessions: number | undefined;
  longSessions: number | undefined;
  sessionCount: number | undefined;
}

export const calculatePeriodStats = (
  sessionsForPeriod: SessionWithRelations[] | undefined,
  startOfPeriod: dayjs.Dayjs,
  endOfPeriod: dayjs.Dayjs,
  userTimezone: string
): PeriodStats => {
  // Calculate total duration using only the portion that falls within the period
  const totalDuration = sessionsForPeriod?.reduce(
    (sum, s) =>
      sum +
      getSessionDurationInPeriod(s, startOfPeriod, endOfPeriod, userTimezone),
    0
  );

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
  const shortSessions = sessionsForPeriod?.filter((s) => {
    const periodDuration = getSessionDurationInPeriod(
      s,
      startOfPeriod,
      endOfPeriod,
      userTimezone
    );
    return periodDuration > 0 && periodDuration < 1800;
  }).length;

  const mediumSessions = sessionsForPeriod?.filter((s) => {
    const periodDuration = getSessionDurationInPeriod(
      s,
      startOfPeriod,
      endOfPeriod,
      userTimezone
    );
    return periodDuration >= 1800 && periodDuration < 7200;
  }).length;

  const longSessions = sessionsForPeriod?.filter((s) => {
    const periodDuration = getSessionDurationInPeriod(
      s,
      startOfPeriod,
      endOfPeriod,
      userTimezone
    );
    return periodDuration >= 7200;
  }).length;

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
    longestSession,
    shortSessions,
    mediumSessions,
    longSessions,
    sessionCount: sessionsForPeriod?.length,
  };
};
