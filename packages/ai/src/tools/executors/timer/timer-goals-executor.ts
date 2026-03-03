import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { MiraToolContext } from '../../mira-tools';
import { getWorkspaceContextWorkspaceId } from '../../workspace-context';
import { buildToolFailure } from './timer-helpers';
import { fetchTimeTrackerStats } from './timer-stats-executor';

dayjs.extend(utc);
dayjs.extend(timezone);

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

  const categoryIds = Array.from(
    new Set(
      goals
        .map((goal) => goal.category_id)
        .filter((categoryId): categoryId is string => typeof categoryId === 'string')
    )
  );

  const categoryTodayTime = new Map<string, number>();
  const categoryWeekTime = new Map<string, number>();

  if (categoryIds.length > 0) {
    const nowInTimezone = dayjs().tz(statsResult.timezone);
    const startOfDay = nowInTimezone.startOf('day');
    const daysFromMonday = (startOfDay.day() + 6) % 7;
    const startOfWeek = startOfDay.subtract(daysFromMonday, 'day');

    const { data: categorySessions, error: categorySessionsError } = await ctx.supabase
      .from('time_tracking_sessions')
      .select('category_id, start_time, duration_seconds')
      .eq('ws_id', workspaceId)
      .eq('user_id', ctx.userId)
      .in('category_id', categoryIds)
      .not('duration_seconds', 'is', null)
      .gte('start_time', startOfWeek.toISOString());

    if (categorySessionsError) {
      return buildToolFailure(
        'TT_GOALS_PROGRESS_STATS_FAILED',
        categorySessionsError.message,
        true
      );
    }

    for (const session of categorySessions ?? []) {
      if (
        typeof session.category_id !== 'string' ||
        typeof session.start_time !== 'string' ||
        typeof session.duration_seconds !== 'number'
      ) {
        continue;
      }

      const sessionStart = dayjs(session.start_time);
      if (!sessionStart.isValid()) continue;

      const durationSeconds = session.duration_seconds;
      const categoryId = session.category_id;

      categoryWeekTime.set(
        categoryId,
        (categoryWeekTime.get(categoryId) ?? 0) + durationSeconds
      );

      if (sessionStart.isSame(startOfDay) || sessionStart.isAfter(startOfDay)) {
        categoryTodayTime.set(
          categoryId,
          (categoryTodayTime.get(categoryId) ?? 0) + durationSeconds
        );
      }
    }
  }

  const progressGoals = goals.map((goal) => {
    const goalTodayTime =
      goal.category_id === null
        ? statsResult.todayTime
        : (categoryTodayTime.get(goal.category_id) ?? 0);
    const goalWeekTime =
      goal.category_id === null
        ? statsResult.weekTime
        : (categoryWeekTime.get(goal.category_id) ?? 0);

    const dailyProgress =
      goal.daily_goal_minutes > 0
        ? Math.min((goalTodayTime / 60 / goal.daily_goal_minutes) * 100, 100)
        : 0;

    const weeklyProgress =
      goal.weekly_goal_minutes && goal.weekly_goal_minutes > 0
        ? Math.min((goalWeekTime / 60 / goal.weekly_goal_minutes) * 100, 100)
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
