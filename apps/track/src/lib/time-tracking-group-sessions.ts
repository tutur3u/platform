import type { TimeTrackingSession } from '@tuturuuu/types';
import { resolveUserDisplayName } from '@tuturuuu/utils/name-helper';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { GroupedSession } from './time-tracking-helper';
import {
  getSessionDays,
  getSessionDurationInPeriod,
} from '@/app/[locale]/(dashboard)/[wsId]/components/session-history/session-utils';
import type { SessionWithRelations } from '@/app/[locale]/(dashboard)/[wsId]/types';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

// Legacy function - now calls the paginated function for backwards compatibility
export const groupSessions = (
  sessions: (TimeTrackingSession & {
    user?: {
      display_name?: string | null;
      handle?: string | null;
      avatar_url?: string | null;
    };
  })[],
  period: 'day' | 'week' | 'month' = 'day',
  userTimezone?: string
): GroupedSession[] => {
  // Use provided timezone or guess
  const tz = userTimezone || dayjs.tz.guess();

  // Group sessions by period and user for management view
  // For overnight sessions, they will be split across multiple periods
  const grouped = new Map<
    string,
    {
      title: string;
      category: null;
      sessions: (TimeTrackingSession & {
        user?: {
          display_name?: string | null;
          handle?: string | null;
          avatar_url?: string | null;
        };
      })[];
      totalDuration: number;
      periodDuration: number;
      firstStartTime: string;
      lastEndTime: string | null;
      status: 'active' | 'paused' | 'completed';
      user: {
        displayName: string | null | undefined;
        avatarUrl: string | null | undefined;
      };
      period: string;
      sessionCount: number;
      sessionTitles: string[];
    }
  >();

  /**
   * Get the period key for a given date
   */
  const getPeriodKey = (date: dayjs.Dayjs): string => {
    if (period === 'day') {
      return date.format('YYYY-MM-DD');
    } else if (period === 'week') {
      // Use ISO week calculation (Monday-based)
      return date.startOf('isoWeek').format('YYYY-MM-DD');
    } else {
      return date.format('YYYY-MM');
    }
  };

  /**
   * Get the start and end of a period given a period key
   */
  const getPeriodBounds = (
    periodKey: string
  ): { start: dayjs.Dayjs; end: dayjs.Dayjs } => {
    if (period === 'day') {
      const date = dayjs.tz(periodKey, tz);
      return {
        start: date.startOf('day'),
        end: date.endOf('day'),
      };
    } else if (period === 'week') {
      const date = dayjs.tz(periodKey, tz);
      return {
        start: date.startOf('isoWeek'),
        end: date.endOf('isoWeek'),
      };
    } else {
      const date = dayjs.tz(`${periodKey}-01`, tz);
      return {
        start: date.startOf('month'),
        end: date.endOf('month'),
      };
    }
  };

  /**
   * Get all periods that a session spans
   */
  const getSessionPeriods = (
    session: TimeTrackingSession
  ): { periodKey: string; start: dayjs.Dayjs; end: dayjs.Dayjs }[] => {
    const periods: {
      periodKey: string;
      start: dayjs.Dayjs;
      end: dayjs.Dayjs;
    }[] = [];

    if (period === 'day') {
      // For day view, use getSessionDays to find all days the session spans
      // We need to cast session to SessionWithRelations for the utility function
      const sessionWithRelations = {
        ...session,
        category: null,
        task: null,
      } as SessionWithRelations;

      const days = getSessionDays(sessionWithRelations, tz);
      for (const dateKey of days) {
        const { start, end } = getPeriodBounds(dateKey);
        periods.push({ periodKey: dateKey, start, end });
      }
    } else {
      // For week/month, we need to check which periods the session spans
      const sessionStart = dayjs.utc(session.start_time).tz(tz);
      const sessionEnd = session.end_time
        ? dayjs.utc(session.end_time).tz(tz)
        : dayjs().tz(tz);

      let currentPeriod = getPeriodKey(sessionStart);
      const endPeriod = getPeriodKey(sessionEnd);

      // Add all periods between start and end
      while (currentPeriod <= endPeriod) {
        const { start, end } = getPeriodBounds(currentPeriod);
        periods.push({ periodKey: currentPeriod, start, end });

        // Move to next period
        if (period === 'week') {
          const nextDate = dayjs.tz(currentPeriod, tz).add(1, 'week');
          currentPeriod = getPeriodKey(nextDate);
        } else {
          const nextDate = dayjs.tz(`${currentPeriod}-01`, tz).add(1, 'month');
          currentPeriod = getPeriodKey(nextDate);
        }
      }
    }

    return periods;
  };

  sessions.forEach((session) => {
    // Get all periods this session spans
    const sessionPeriods = getSessionPeriods(session);

    for (const { periodKey, start, end } of sessionPeriods) {
      const key = `${periodKey}-${session.user_id}`;

      // Calculate the duration that falls within this specific period
      const sessionWithRelations = {
        ...session,
        category: null,
        task: null,
      } as SessionWithRelations;

      const periodDurationForSession = getSessionDurationInPeriod(
        sessionWithRelations,
        start,
        end,
        tz
      );

      // Skip if no duration in this period
      if (periodDurationForSession <= 0) {
        continue;
      }

      if (!grouped.has(key)) {
        grouped.set(key, {
          title: `${resolveUserDisplayName(session.user, { fallback: 'Unknown User' })} - ${periodKey}`,
          category: null, // Not used in management view
          sessions: [],
          totalDuration: 0,
          periodDuration: 0,
          firstStartTime: session.start_time,
          lastEndTime: session.end_time,
          status: session.is_running ? 'active' : 'completed',
          user: {
            displayName: session.user?.display_name,
            avatarUrl: session.user?.avatar_url,
          },
          period: periodKey,
          sessionCount: 0,
          sessionTitles: [],
        });
      }

      const group = grouped.get(key)!;

      // Only add session once per group (avoid duplicates if session spans multiple periods)
      if (!group.sessions.some((s) => s.id === session.id)) {
        group.sessions.push(session);
        // totalDuration is the sum of all session durations (for backwards compatibility)
        group.totalDuration += session.duration_seconds || 0;
      }

      // periodDuration is the sum of durations that actually fall within this period
      group.periodDuration += periodDurationForSession;
      group.sessionCount = group.sessions.length;

      // Update session titles
      if (session.title && !group.sessionTitles.includes(session.title)) {
        group.sessionTitles.push(session.title);
      }

      // Update time ranges
      if (session.start_time < group.firstStartTime) {
        group.firstStartTime = session.start_time;
      }
      if (
        session.end_time &&
        (!group.lastEndTime || session.end_time > group.lastEndTime)
      ) {
        group.lastEndTime = session.end_time;
      }

      // Update status - if any session is running, mark group as active
      if (session.is_running) {
        group.status = 'active';
      }
    }
  });

  return Array.from(grouped.values()) as GroupedSession[];
};
