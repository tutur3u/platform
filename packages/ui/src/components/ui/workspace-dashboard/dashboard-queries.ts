import { queryOptions } from '@tanstack/react-query';
import { listWorkspaceCalendarEvents } from '@tuturuuu/internal-api/calendar';
import { getUserTaskDashboard } from '@tuturuuu/internal-api/tasks';
import {
  getCurrentUserRunningTimeTrackingSession,
  getCurrentUserTimeTrackingDailyTotals,
  getCurrentUserTimeTrackingStats,
  listCurrentUserTimeTrackingGoals,
} from '@tuturuuu/internal-api/time-tracking';
import {
  lastSevenDays,
  localDayRange,
  type TaskDashboardData,
} from './dashboard-model';

const STALE_TIME = 60_000;

/** Tasks feed through the canonical internal-api helper (Tasks app owns it). */
export function dashboardTasksQuery(wsId: string, isPersonal: boolean) {
  return queryOptions({
    queryKey: ['workspace-dashboard', wsId, 'tasks', { isPersonal }] as const,
    queryFn: (): Promise<TaskDashboardData> =>
      getUserTaskDashboard({ wsId, isPersonal }),
    staleTime: STALE_TIME,
  });
}

/**
 * Today's events for the viewer's local day. The day key keeps the cache
 * correct across midnight without refetching on every render.
 */
export function dashboardAgendaQuery(wsId: string, now: Date) {
  const { start, end } = localDayRange(now);
  const dayKey = start.toISOString();
  return queryOptions({
    queryKey: ['workspace-dashboard', wsId, 'agenda', dayKey] as const,
    queryFn: async ({ signal }) => {
      const result = await listWorkspaceCalendarEvents(
        wsId,
        { start_at: start.toISOString(), end_at: end.toISOString() },
        { signal }
      );
      return result.data;
    },
    staleTime: STALE_TIME,
  });
}

export function viewerTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** The viewer's running timer; refreshed while the card is mounted. */
export function dashboardRunningTimerQuery(wsId: string) {
  return queryOptions({
    queryKey: ['workspace-dashboard', wsId, 'time', 'running'] as const,
    queryFn: ({ signal }) =>
      getCurrentUserRunningTimeTrackingSession(wsId, { signal }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** The viewer's tracked totals, with "today" in their own time zone. */
export function dashboardTimeStatsQuery(wsId: string) {
  const timezone = viewerTimeZone();
  return queryOptions({
    queryKey: ['workspace-dashboard', wsId, 'time', 'stats', timezone] as const,
    queryFn: ({ signal }) =>
      getCurrentUserTimeTrackingStats(wsId, { timezone }, { signal }),
    staleTime: STALE_TIME,
  });
}

/** The viewer's own time-tracking goals. */
export function dashboardTimeGoalsQuery(wsId: string) {
  return queryOptions({
    queryKey: ['workspace-dashboard', wsId, 'time', 'goals'] as const,
    queryFn: ({ signal }) => listCurrentUserTimeTrackingGoals(wsId, { signal }),
    staleTime: 5 * 60_000,
  });
}

/** Tracked seconds for each of the viewer's last seven local days. */
export function dashboardTimeWeekQuery(wsId: string, now: Date) {
  const timezone = viewerTimeZone();
  const { days, dateFrom, dateTo } = lastSevenDays(now, timezone);
  return queryOptions({
    queryKey: [
      'workspace-dashboard',
      wsId,
      'time',
      'week',
      timezone,
      days[6]!.key,
    ] as const,
    queryFn: async ({ signal }) => {
      const totals = await getCurrentUserTimeTrackingDailyTotals(
        wsId,
        { dateFrom, dateTo, timezone },
        { signal }
      );
      const byDate = new Map(totals.map((day) => [day.date, day.totalDuration]));
      return days.map(({ key, date }) => ({
        key,
        date,
        seconds: byDate.get(key) ?? 0,
      }));
    },
    staleTime: STALE_TIME,
  });
}
