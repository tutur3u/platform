import type { MiraToolContext } from '../../mira-tools';
import { getWorkspaceContextWorkspaceId } from '../../workspace-context';
import { buildToolFailure } from './timer-helpers';
import { fetchTimeTrackerStats } from './timer-stats-executor';

export type TimeTrackerGoalRow = {
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

export function normalizeCategory(
  category: TimeTrackerGoalRow['category']
): { id: string; name: string | null; color: string | null } | null {
  if (!category) return null;
  if (Array.isArray(category)) return category[0] ?? null;
  return category;
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
