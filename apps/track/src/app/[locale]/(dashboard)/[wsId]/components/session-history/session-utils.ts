import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { SessionWithRelations } from '../../types';
import type { StackedSession, ViewMode } from './session-types';

export {
  calculatePeriodStats,
  getDurationCategory,
  getSessionDurationForDay,
  getSessionDurationInPeriod,
  getTimeOfDayCategory,
  type PeriodStats,
} from '@tuturuuu/hooks/utils/time-tracker-utils';

import {
  getSessionDurationForDay,
  getSessionDurationInPeriod,
} from '@tuturuuu/hooks/utils/time-tracker-utils';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

/**
 * Check if a session overlaps with a given period.
 * A session overlaps if any part of it falls within the period.
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
    : dayjs().tz(userTimezone);

  return sessionStart.isBefore(periodEnd) && sessionEnd.isAfter(periodStart);
};

/**
 * Get all days that a session spans.
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
 */
export const createStackedSession = (
  sessions: SessionWithRelations[],
  userTimezone?: string,
  displayDate?: string,
  periodStart?: dayjs.Dayjs,
  periodEnd?: dayjs.Dayjs
): StackedSession | null => {
  if (sessions.length === 0) {
    throw new Error('Cannot create stacked session from empty array');
  }

  const tz = userTimezone || dayjs.tz.guess();

  const totalDuration = sessions.reduce(
    (sum, s) => sum + (s.duration_seconds || 0),
    0
  );

  let periodDuration = totalDuration;
  if (displayDate) {
    const displayDay = dayjs.tz(displayDate, tz);
    const isMonthView =
      periodStart && periodEnd && periodEnd.diff(periodStart, 'day') > 7;

    if (isMonthView) {
      const weekStart = displayDay.startOf('isoWeek');
      const weekEnd = displayDay.endOf('isoWeek');
      periodDuration = sessions.reduce(
        (sum, s) => sum + getSessionDurationInPeriod(s, weekStart, weekEnd, tz),
        0
      );
    } else {
      periodDuration = sessions.reduce(
        (sum, s) => sum + getSessionDurationForDay(s, displayDay, tz),
        0
      );
    }
  } else if (periodStart && periodEnd) {
    periodDuration = sessions.reduce(
      (sum, s) =>
        sum + getSessionDurationInPeriod(s, periodStart, periodEnd, tz),
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
 */
export const stackSessions = (
  sessions: SessionWithRelations[] | undefined,
  viewMode: ViewMode,
  periodStart?: dayjs.Dayjs,
  periodEnd?: dayjs.Dayjs
): StackedSession[] => {
  if (!sessions || sessions.length === 0) return [];

  const userTimezone = dayjs.tz.guess();
  const groups: {
    [key: string]: {
      sessions: SessionWithRelations[];
      displayDate?: string;
    };
  } = {};

  sessions?.forEach((session) => {
    if (viewMode === 'month') {
      const sessionStart = dayjs.utc(session.start_time).tz(userTimezone);
      const sessionEnd = session.end_time
        ? dayjs.utc(session.end_time).tz(userTimezone)
        : dayjs().tz(userTimezone);

      const startWeek = sessionStart.startOf('isoWeek');
      const endWeek = sessionEnd.startOf('isoWeek');
      const weeks: dayjs.Dayjs[] = [];
      let current = startWeek;

      while (current.isBefore(endWeek) || current.isSame(endWeek, 'week')) {
        if (periodStart && periodEnd) {
          const weekEnd = current.endOf('isoWeek');
          if (
            weekEnd.isBefore(periodStart.startOf('day')) ||
            current.isAfter(periodEnd.endOf('day'))
          ) {
            current = current.add(1, 'week');
            continue;
          }
        }
        weeks.push(current.clone());
        current = current.add(1, 'week');
      }

      weeks.forEach((weekStart) => {
        const weekKey = weekStart.format('YYYY-MM-DD');
        const groupKey = `${weekKey}-${session.title}-${session.category_id || 'none'}-${session.task_id || 'none'}`;
        if (!groups[groupKey]) {
          groups[groupKey] = { sessions: [], displayDate: weekKey };
        }
        if (!groups[groupKey]?.sessions.some((s) => s.id === session.id)) {
          groups[groupKey]?.sessions.push(session);
        }
      });
    } else {
      const sessionDays = getSessionDays(session, userTimezone);
      sessionDays.forEach((dateKey) => {
        const dayDate = dayjs.tz(dateKey, userTimezone);
        if (periodStart && periodEnd) {
          if (
            dayDate.isBefore(periodStart.startOf('day')) ||
            dayDate.isAfter(periodEnd.endOf('day'))
          ) {
            return;
          }
        }

        const groupKey = `${dateKey}-${session.title}-${session.category_id || 'none'}-${session.task_id || 'none'}`;
        if (!groups[groupKey]) {
          groups[groupKey] = { sessions: [], displayDate: dateKey };
        }
        if (!groups[groupKey]?.sessions.some((s) => s.id === session.id)) {
          groups[groupKey]?.sessions.push(session);
        }
      });
    }
  });

  const stacks: StackedSession[] = [];
  Object.values(groups).forEach((group) => {
    if (group.sessions.length > 0) {
      const sortedSessions = group.sessions.sort((a, b) =>
        dayjs(a.start_time).diff(dayjs(b.start_time))
      );
      const newStack = createStackedSession(
        sortedSessions,
        userTimezone,
        group.displayDate,
        periodStart,
        periodEnd
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
    RED: 'bg-dynamic-red',
    BLUE: 'bg-dynamic-blue',
    GREEN: 'bg-dynamic-green',
    YELLOW: 'bg-dynamic-yellow',
    ORANGE: 'bg-dynamic-orange',
    PURPLE: 'bg-dynamic-purple',
    PINK: 'bg-dynamic-pink',
    INDIGO: 'bg-dynamic-indigo',
    CYAN: 'bg-dynamic-cyan',
    GRAY: 'bg-dynamic-gray',
  };
  return colorMap[color] || 'bg-dynamic-blue';
};

/**
 * Helper function to check if a session is older than the workspace threshold.
 */
export const isSessionOlderThanThreshold = (
  session: SessionWithRelations,
  thresholdDays: number | null | undefined
): boolean => {
  if (thresholdDays === null) return false;
  if (thresholdDays === undefined) return true;
  if (thresholdDays === 0) return true;
  const sessionStartTime = dayjs.utc(session.start_time);
  const thresholdAgo = dayjs().utc().subtract(thresholdDays, 'day');
  return sessionStartTime.isBefore(thresholdAgo);
};

/**
 * Helper function to check if a datetime string is more than threshold days ago.
 */
export const isDatetimeMoreThanThresholdAgo = (
  datetimeString: string,
  timezone: string,
  thresholdDays: number | null | undefined
): boolean => {
  if (!datetimeString) return false;
  if (thresholdDays === null) return false;
  if (thresholdDays === undefined) return true;
  if (thresholdDays === 0) return true;
  const datetime = dayjs.tz(datetimeString, timezone).utc();
  if (!datetime.isValid()) return false;
  const thresholdAgo = dayjs().utc().subtract(thresholdDays, 'day');
  return datetime.isBefore(thresholdAgo);
};

/**
 * Sort session groups by date descending.
 */
export const sortSessionGroups = (
  entries: [string, StackedSession[]][]
): [string, StackedSession[]][] => {
  return [...entries].sort(([keyA], [keyB]) => {
    const dateA = dayjs(keyA, 'dddd, MMMM D, YYYY', true);
    const dateB = dayjs(keyB, 'dddd, MMMM D, YYYY', true);

    if (!dateA.isValid() || !dateB.isValid()) {
      if (dateA.isValid() !== dateB.isValid()) {
        return dateA.isValid() ? -1 : 1;
      }
      return keyA.localeCompare(keyB);
    }

    return dateB.diff(dateA);
  });
};
