import type { MiraToolContext } from '../../mira-tools';
import { getWorkspaceContextWorkspaceId } from '../../workspace-context';
import {
  buildToolFailure,
  resolveTimezone,
  toFiniteNumber,
} from './timer-helpers';

export type TimeTrackerStatsRow = {
  today_time?: number | null;
  week_time?: number | null;
  month_time?: number | null;
  streak?: number | null;
  daily_activity?: Array<{
    date?: string | null;
    duration?: number | null;
    sessions?: number | null;
  }> | null;
};

export async function fetchTimeTrackerStats(
  ctx: MiraToolContext,
  options?: {
    timezone?: string;
    summaryOnly?: boolean;
    daysBack?: number;
  }
) {
  const summaryOnly = options?.summaryOnly ?? true;
  const daysBack = options?.daysBack ?? 365;
  const appliedDaysBack = summaryOnly ? 0 : daysBack;
  const timezoneResolution = resolveTimezone(options?.timezone, ctx.timezone);
  const workspaceId = getWorkspaceContextWorkspaceId(ctx);

  const { data, error } = await ctx.supabase.rpc('get_time_tracker_stats', {
    p_user_id: ctx.userId,
    p_ws_id: workspaceId,
    p_is_personal: ctx.workspaceContext?.personal ?? false,
    p_timezone: timezoneResolution.resolved,
    p_days_back: appliedDaysBack,
  });

  if (error) {
    return buildToolFailure('TT_STATS_RPC_FAILED', error.message, true);
  }

  const row = ((Array.isArray(data) ? data[0] : null) ??
    {}) as TimeTrackerStatsRow;
  const dailyActivity = Array.isArray(row.daily_activity)
    ? row.daily_activity.map((entry) => ({
        date: entry.date ?? '',
        duration: toFiniteNumber(entry.duration),
        sessions: toFiniteNumber(entry.sessions),
      }))
    : [];

  const todayTime = toFiniteNumber(row.today_time);
  const weekTime = toFiniteNumber(row.week_time);
  const monthTime = toFiniteNumber(row.month_time);
  const streak = toFiniteNumber(row.streak);
  const totalDuration = dailyActivity.reduce(
    (sum, entry) => sum + toFiniteNumber(entry.duration),
    0
  );
  const totalSessions = dailyActivity.reduce(
    (sum, entry) => sum + toFiniteNumber(entry.sessions),
    0
  );
  const averageDailyDuration =
    dailyActivity.length > 0 ? totalDuration / dailyActivity.length : 0;

  return {
    success: true,
    workspaceId,
    timezone: timezoneResolution.resolved,
    timezoneResolution,
    summaryOnly,
    daysBack: appliedDaysBack,
    todayTime,
    weekTime,
    monthTime,
    streak,
    dailyActivity,
    insights: {
      totalDuration,
      totalSessions,
      averageDailyDuration,
      averageSessionDuration:
        totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0,
    },
  };
}

export async function executeGetTimeTrackerStats(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const summaryOnly =
    typeof args.summaryOnly === 'boolean' ? args.summaryOnly : true;
  const daysBackRaw = Number(args.daysBack);
  const daysBack =
    Number.isFinite(daysBackRaw) && daysBackRaw > 0
      ? Math.min(Math.floor(daysBackRaw), 3650)
      : 365;
  const timezoneArg =
    typeof args.timezone === 'string' ? args.timezone : undefined;

  const result = await fetchTimeTrackerStats(ctx, {
    timezone: timezoneArg,
    summaryOnly,
    daysBack,
  });

  if (!result.success) return result;

  return {
    success: true,
    todayTime: result.todayTime,
    weekTime: result.weekTime,
    monthTime: result.monthTime,
    streak: result.streak,
    dailyActivity: result.dailyActivity,
    stats: {
      todayTimeSeconds: result.todayTime,
      weekTimeSeconds: result.weekTime,
      monthTimeSeconds: result.monthTime,
      streakDays: result.streak,
      dailyActivity: result.dailyActivity.map((entry) => ({
        date: entry.date,
        durationSeconds: entry.duration,
        sessionCount: entry.sessions,
      })),
    },
    insights: result.insights,
    meta: {
      workspaceId: result.workspaceId,
      workspaceContextId: ctx.workspaceContext?.workspaceContextId ?? ctx.wsId,
      isPersonalContext: ctx.workspaceContext?.personal ?? false,
      filtersApplied: {
        summaryOnly: result.summaryOnly,
        daysBack: result.daysBack,
      },
      timezone: {
        requested: result.timezoneResolution.requested,
        resolved: result.timezoneResolution.resolved,
        validRequested: result.timezoneResolution.validRequested,
        usedFallback: result.timezoneResolution.usedFallback,
      },
      units: {
        durations: 'seconds',
        streak: 'days',
        goalTargets: 'minutes',
        progress: 'percent',
      },
    },
  };
}
