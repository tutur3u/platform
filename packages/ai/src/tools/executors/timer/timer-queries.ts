import type { MiraToolContext } from '../../mira-tools';
import { getWorkspaceContextWorkspaceId } from '../../workspace-context';
import {
  buildToolFailure,
  coerceOptionalString,
  normalizeCursor,
  resolveTimezone,
  toFiniteNumber,
} from './timer-helpers';

export async function executeListTimeTrackingSessions(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const includePending = Boolean(args.includePending);
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
  const cursor = args.cursor;

  let query = ctx.supabase
    .from('time_tracking_sessions')
    .select(
      `
      id, title, description, start_time, end_time, duration_seconds,
      is_running, category_id, task_id, pending_approval, ws_id,
      category:time_tracking_categories(id, name, color),
      task:tasks(id, name)
    `
    )
    .eq('ws_id', ctx.wsId)
    .eq('user_id', ctx.userId)
    .order('start_time', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (!includePending) {
    query = query.eq('pending_approval', false);
  }

  if (cursor !== undefined) {
    const normalized = normalizeCursor(cursor);
    if (!normalized.ok) return { error: normalized.error };

    const esc = (value: string) =>
      value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    query = query.or(
      `start_time.lt."${esc(normalized.lastStartTime)}",and(start_time.eq."${esc(normalized.lastStartTime)}",id.lt."${esc(normalized.lastId)}")`
    );
  }

  const { data, error } = await query;
  if (error) return { error: error.message };

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const sessions = hasMore ? rows.slice(0, limit) : rows;
  const last = sessions[sessions.length - 1];

  return {
    success: true,
    count: sessions.length,
    sessions,
    hasMore,
    nextCursor: last ? `${last.start_time}|${last.id}` : null,
  };
}

export async function executeGetTimeTrackingSession(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const sessionIdNormalized = coerceOptionalString(args.sessionId);
  const idNormalized = coerceOptionalString(args.id);
  const sessionId = sessionIdNormalized ?? idNormalized;
  if (!sessionId) return { error: 'sessionId is required' };

  const { data, error } = await ctx.supabase
    .from('time_tracking_sessions')
    .select(
      `
      *,
      category:time_tracking_categories(*),
      task:tasks(*)
    `
    )
    .eq('id', sessionId)
    .eq('ws_id', ctx.wsId)
    .eq('user_id', ctx.userId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'Session not found' };

  return { success: true, session: data };
}

type TimeTrackerStatsRow = {
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

type TimeTrackerGoalRow = {
  id: string;
  category_id: string | null;
  daily_goal_minutes: number;
  weekly_goal_minutes: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category:
    | {
        id: string;
        name: string | null;
        color: string | null;
      }
    | Array<{
        id: string;
        name: string | null;
        color: string | null;
      }>
    | null;
};

type TimeTrackingCategoryRow = {
  id: string;
  ws_id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeCategory(
  category: TimeTrackerGoalRow['category']
): { id: string; name: string | null; color: string | null } | null {
  if (!category) return null;
  if (Array.isArray(category)) return category[0] ?? null;
  return category;
}

async function fetchTimeTrackerStats(
  ctx: MiraToolContext,
  options?: {
    timezone?: string;
    summaryOnly?: boolean;
    daysBack?: number;
  }
) {
  const summaryOnly = options?.summaryOnly ?? true;
  const daysBack = options?.daysBack ?? 365;
  const timezoneResolution = resolveTimezone(options?.timezone, ctx.timezone);
  const workspaceId = getWorkspaceContextWorkspaceId(ctx);

  const { data, error } = await ctx.supabase.rpc('get_time_tracker_stats', {
    p_user_id: ctx.userId,
    p_ws_id: workspaceId,
    p_is_personal: ctx.workspaceContext?.personal ?? false,
    p_timezone: timezoneResolution.resolved,
    p_days_back: summaryOnly ? 0 : daysBack,
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
    daysBack,
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

export async function executeGetTimeTrackerGoals(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const includeInactive = Boolean(args.includeInactive);
  const includeProgress =
    typeof args.includeProgress === 'boolean' ? args.includeProgress : true;
  const timezoneArg =
    typeof args.timezone === 'string' ? args.timezone : undefined;
  const workspaceId = getWorkspaceContextWorkspaceId(ctx);

  const { count: totalGoalCount, error: totalCountError } = await ctx.supabase
    .from('time_tracking_goals')
    .select('id', { count: 'exact', head: true })
    .eq('ws_id', workspaceId)
    .eq('user_id', ctx.userId);

  if (totalCountError) {
    return buildToolFailure(
      'TT_GOALS_COUNT_FAILED',
      totalCountError.message,
      true
    );
  }

  let query = ctx.supabase
    .from('time_tracking_goals')
    .select(
      `
      id,
      category_id,
      daily_goal_minutes,
      weekly_goal_minutes,
      is_active,
      created_at,
      updated_at,
      category:time_tracking_categories(id, name, color)
    `
    )
    .eq('ws_id', workspaceId)
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error)
    return buildToolFailure('TT_GOALS_FETCH_FAILED', error.message, true);

  const goals = ((data ?? []) as TimeTrackerGoalRow[]).map((goal) => ({
    ...goal,
    category: normalizeCategory(goal.category),
  }));

  const activeGoalCount = goals.filter((goal) => goal.is_active).length;

  if (!includeProgress) {
    return {
      success: true,
      workspaceId,
      count: goals.length,
      goals,
      meta: {
        workspaceId,
        workspaceContextId:
          ctx.workspaceContext?.workspaceContextId ?? ctx.wsId,
        isPersonalContext: ctx.workspaceContext?.personal ?? false,
        filtersApplied: {
          includeInactive,
          includeProgress,
        },
        counts: {
          totalGoalCount: totalGoalCount ?? 0,
          activeGoalCount,
          returnedGoalCount: goals.length,
        },
        units: {
          durations: 'seconds',
          goalTargets: 'minutes',
          progress: 'percent',
        },
      },
    };
  }

  const statsResult = await fetchTimeTrackerStats(ctx, {
    timezone: timezoneArg,
    summaryOnly: true,
  });
  if (!statsResult.success) return statsResult;

  const progressGoals = goals.map((goal) => {
    const dailyProgress =
      goal.daily_goal_minutes > 0
        ? Math.min(
            (statsResult.todayTime / 60 / goal.daily_goal_minutes) * 100,
            100
          )
        : 0;

    const weeklyProgress =
      goal.weekly_goal_minutes && goal.weekly_goal_minutes > 0
        ? Math.min(
            (statsResult.weekTime / 60 / goal.weekly_goal_minutes) * 100,
            100
          )
        : null;

    return {
      ...goal,
      progress: {
        dailyPercent: Number(dailyProgress.toFixed(2)),
        dailyCompleted: dailyProgress >= 100,
        weeklyPercent:
          weeklyProgress === null ? null : Number(weeklyProgress.toFixed(2)),
        weeklyCompleted: weeklyProgress === null ? null : weeklyProgress >= 100,
      },
    };
  });

  return {
    success: true,
    workspaceId,
    timezone: statsResult.timezone,
    count: progressGoals.length,
    current: {
      todayTime: statsResult.todayTime,
      weekTime: statsResult.weekTime,
      monthTime: statsResult.monthTime,
      streak: statsResult.streak,
    },
    goals: progressGoals,
    meta: {
      workspaceId,
      workspaceContextId: ctx.workspaceContext?.workspaceContextId ?? ctx.wsId,
      isPersonalContext: ctx.workspaceContext?.personal ?? false,
      filtersApplied: {
        includeInactive,
        includeProgress,
      },
      counts: {
        totalGoalCount: totalGoalCount ?? 0,
        activeGoalCount,
        returnedGoalCount: progressGoals.length,
      },
      timezone: {
        requested: statsResult.timezoneResolution.requested,
        resolved: statsResult.timezoneResolution.resolved,
        validRequested: statsResult.timezoneResolution.validRequested,
        usedFallback: statsResult.timezoneResolution.usedFallback,
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

export async function executeListTimeTrackingCategories(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const workspaceId = getWorkspaceContextWorkspaceId(ctx);
  const limitRaw = Number(args.limit);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), 50)
      : 20;
  const cursor = args.cursor;

  let query = ctx.supabase
    .from('time_tracking_categories')
    .select('id, ws_id, name, description, color, created_at, updated_at')
    .eq('ws_id', workspaceId)
    .order('name', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit + 1);

  if (cursor !== undefined) {
    if (typeof cursor !== 'string' || !cursor.includes('|')) {
      return buildToolFailure(
        'TT_CATEGORIES_INVALID_CURSOR',
        'Invalid cursor format',
        false
      );
    }

    const [lastName, lastId] = cursor.split('|');
    if (!lastName || !lastId) {
      return buildToolFailure(
        'TT_CATEGORIES_INVALID_CURSOR',
        'Invalid cursor format',
        false
      );
    }

    const esc = (value: string) =>
      value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    query = query.or(
      `name.gt."${esc(lastName)}",and(name.eq."${esc(lastName)}",id.gt."${esc(lastId)}")`
    );
  }

  const { data, error } = await query;
  if (error) {
    return buildToolFailure('TT_CATEGORIES_FETCH_FAILED', error.message, true);
  }

  const rows = (data ?? []) as TimeTrackingCategoryRow[];
  const hasMore = rows.length > limit;
  const categories = hasMore ? rows.slice(0, limit) : rows;
  const last = categories[categories.length - 1];

  return {
    success: true,
    categories,
    count: categories.length,
    hasMore,
    nextCursor: last ? `${last.name}|${last.id}` : null,
    meta: {
      workspaceId,
      workspaceContextId: ctx.workspaceContext?.workspaceContextId ?? ctx.wsId,
      isPersonalContext: ctx.workspaceContext?.personal ?? false,
      filtersApplied: {
        cursorProvided: cursor !== undefined,
        limit,
      },
    },
  };
}
