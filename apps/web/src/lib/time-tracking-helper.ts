import { transformAssignees } from '@/lib/task-helper';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import 'server-only';

// Enhanced pagination interface
export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Type definitions for time tracking data
export interface GroupedSession {
  title: string;
  category: null;
  sessions: any[];
  totalDuration: number;
  firstStartTime: string;
  lastEndTime: string | null;
  status: 'active' | 'paused' | 'completed';
  user: {
    displayName: string | null;
    avatarUrl: string | null;
  };
  period: string;
  sessionCount: number;
  sessionTitles: string[];
}

export interface TimeTrackingStats {
  totalSessions: number;
  activeSessions: number;
  activeUsers: number;
  todayTime: number;
  weekTime: number;
  monthTime: number;
  todaySessions: number;
  weekSessions: number;
  monthSessions: number;
  streak: number;
}

export interface PeriodSummary {
  period: string;
  uniqueUsers: number;
  totalSessions: number;
  totalDuration: number;
  avgDuration: number;
  earliestSession: string;
  latestSession: string;
  activeSessions: number;
}

export interface DailyActivity {
  date: string;
  duration: number;
  sessions: number;
  users: number;
}

// Get paginated grouped sessions using database RPC
export const getGroupedSessionsPaginated = async (
  wsId: string,
  period: 'day' | 'week' | 'month' = 'day',
  params: PaginationParams = {}
): Promise<PaginatedResult<GroupedSession>> => {
  const { page = 1, limit = 50, search } = params;
  const supabase = await createClient();

  // Since the RPC might not be available in types yet, we'll call it directly
  try {
    const { data, error } = await supabase.rpc(
      'get_time_tracking_sessions_paginated',
      {
        p_ws_id: wsId,
        p_period: period,
        p_page: page,
        p_limit: limit,
        p_search: search || null,
      }
    );

    if (error) {
      console.error('Error fetching paginated sessions:', error);
      throw new Error('Failed to fetch time tracking sessions');
    }

    return (
      (data as PaginatedResult<GroupedSession>) || {
        data: [],
        pagination: { page, limit, total: 0, pages: 0 },
      }
    );
  } catch (error) {
    console.error('RPC not available, falling back to legacy method:', error);
    // Fallback to legacy method if RPC is not available
    return await getFallbackGroupedSessions(wsId, period, params);
  }
};

// Fallback method for when RPC is not available
const getFallbackGroupedSessions = async (
  wsId: string,
  period: 'day' | 'week' | 'month' = 'day',
  params: PaginationParams = {}
): Promise<PaginatedResult<GroupedSession>> => {
  const { page = 1, limit = 50, search } = params;
  const supabase = await createClient();

  let query = supabase
    .from('time_tracking_sessions')
    .select(`
      *,
      category:time_tracking_categories(name, color),
      user:users(display_name, avatar_url)
    `)
    .eq('ws_id', wsId)
    .order('start_time', { ascending: false });

  if (search) {
    query = query.or(
      `title.ilike.%${search}%,user.display_name.ilike.%${search}%`
    );
  }

  const { data: sessions, error } = await query.limit(limit * 10); // Get more to account for grouping

  if (error) {
    throw new Error('Failed to fetch time tracking sessions');
  }

  const groupedSessions = groupSessions(sessions || [], period);
  const total = groupedSessions.length;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedData = groupedSessions.slice(startIndex, endIndex);

  return {
    data: paginatedData,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

// Get time tracking statistics using database RPC
export const getTimeTrackingStats = async (
  wsId: string,
  userId?: string
): Promise<TimeTrackingStats> => {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('get_time_tracking_stats', {
      p_ws_id: wsId,
      p_user_id: userId || null,
    });

    if (error) {
      console.error('Error fetching time tracking stats:', error);
      throw new Error('Failed to fetch time tracking statistics');
    }

    return (
      (data as TimeTrackingStats) || {
        totalSessions: 0,
        activeSessions: 0,
        activeUsers: 0,
        todayTime: 0,
        weekTime: 0,
        monthTime: 0,
        todaySessions: 0,
        weekSessions: 0,
        monthSessions: 0,
        streak: 0,
      }
    );
  } catch (error) {
    console.error('RPC not available for stats, returning defaults:', error);
    return {
      totalSessions: 0,
      activeSessions: 0,
      activeUsers: 0,
      todayTime: 0,
      weekTime: 0,
      monthTime: 0,
      todaySessions: 0,
      weekSessions: 0,
      monthSessions: 0,
      streak: 0,
    };
  }
};

// Get period summary statistics
export const getPeriodSummaryStats = async (
  wsId: string,
  period: 'day' | 'week' | 'month' = 'day'
): Promise<PeriodSummary[]> => {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('get_period_summary_stats', {
      p_ws_id: wsId,
      p_period: period,
    });

    if (error) {
      console.error('Error fetching period summary stats:', error);
      throw new Error('Failed to fetch period summary statistics');
    }

    return (data as PeriodSummary[]) || [];
  } catch (error) {
    console.error(
      'RPC not available for period summary, returning empty array:',
      error
    );
    return [];
  }
};

// Get daily activity heatmap data
export const getDailyActivityHeatmap = async (
  wsId: string,
  userId?: string,
  daysBack: number = 365
): Promise<DailyActivity[]> => {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('get_daily_activity_heatmap', {
      p_ws_id: wsId,
      p_user_id: userId || null,
      p_days_back: daysBack,
    });

    if (error) {
      console.error('Error fetching daily activity heatmap:', error);
      throw new Error('Failed to fetch daily activity data');
    }

    return (data as DailyActivity[]) || [];
  } catch (error) {
    console.error(
      'RPC not available for heatmap, returning empty array:',
      error
    );
    return [];
  }
};

// Legacy function - now calls the paginated function for backwards compatibility
export const groupSessions = (
  sessions: any[],
  period: 'day' | 'week' | 'month' = 'day'
): GroupedSession[] => {
  // Group sessions by period and user for management view
  const grouped = new Map();

  const getPeriodKey = (startTime: string) => {
    const date = new Date(startTime);

    if (period === 'day') {
      return date.toISOString().split('T')[0]; // YYYY-MM-DD
    } else if (period === 'week') {
      // Use ISO week calculation (Monday-based)
      const startOfWeek = new Date(date);
      const dayOfWeek = date.getDay();
      const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0, Sunday = 6
      startOfWeek.setDate(date.getDate() - daysToSubtract);
      return startOfWeek.toISOString().split('T')[0]; // Return Monday's date as week key
    } else {
      return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    }
  };

  sessions.forEach((session) => {
    const periodKey = getPeriodKey(session.start_time);
    const key = `${periodKey}-${session.user_id}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        title: `${session.user?.display_name || 'Unknown User'} - ${periodKey}`,
        category: null, // Not used in management view
        sessions: [],
        totalDuration: 0,
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

    const group = grouped.get(key);
    group.sessions.push(session);
    group.totalDuration += session.duration_seconds || 0;
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
  });

  return Array.from(grouped.values()) as GroupedSession[];
};

export const getTimeTrackingData = async (wsId: string, userId: string) => {
  const supabase = await createClient();

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', wsId)
    .single();

  if (!workspace?.id) {
    throw new Error('Workspace not found');
  }

  const sbAdmin = await createAdminClient();

  const categoriesPromise = sbAdmin
    .from('time_tracking_categories')
    .select('*')
    .eq('ws_id', wsId);

  const runningSessionPromise = sbAdmin
    .from('time_tracking_sessions')
    .select('*, category:time_tracking_categories(*), task:tasks(*)')
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .is('duration_seconds', null)
    .single();

  const recentSessionsPromise = sbAdmin
    .from('time_tracking_sessions')
    .select('*, category:time_tracking_categories(*), task:tasks(*)')
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .order('start_time', { ascending: false })
    .limit(50);

  const goalsPromise = sbAdmin
    .from('time_tracking_goals')
    .select('*, category:time_tracking_categories(*)')
    .eq('ws_id', wsId)
    .eq('user_id', userId);

  const tasksPromise = sbAdmin
    .from('tasks')
    .select(
      `
      *,
      list:task_lists!inner(
        id,
        name,
        status,
        board:workspace_boards!inner(
          id,
          name,
          ws_id
        )
      ),
      assignees:task_assignees(
        user:users(
          id,
          display_name,
          avatar_url,
          user_private_details(email)
        )
      )
    `
    )
    .eq('list.board.ws_id', wsId)
    .eq('deleted', false)
    .eq('archived', false)
    .in('list.status', ['not_started', 'active']) // Only include tasks from not_started and active lists
    .eq('list.deleted', false)
    .order('created_at', { ascending: false })
    .limit(100);

  // Stats are more complex and require processing, which we'll do after fetching
  const allSessionsPromise = sbAdmin
    .from('time_tracking_sessions')
    .select('start_time, duration_seconds')
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .not('duration_seconds', 'is', null);

  const [
    { data: categories, error: categoriesError },
    { data: runningSession, error: runningSessionError },
    { data: recentSessions, error: recentSessionsError },
    { data: goals, error: goalsError },
    { data: tasks, error: tasksError },
    { data: allSessions, error: allSessionsError },
  ] = await Promise.all([
    categoriesPromise,
    runningSessionPromise,
    recentSessionsPromise,
    goalsPromise,
    tasksPromise,
    allSessionsPromise,
  ]);

  if (
    categoriesError ||
    (runningSessionError && runningSessionError.code !== 'PGRST116') || // Ignore no rows found for running session
    recentSessionsError ||
    goalsError ||
    tasksError ||
    allSessionsError
  ) {
    console.error({
      categoriesError,
      runningSessionError,
      recentSessionsError,
      goalsError,
      tasksError,
      allSessionsError,
    });
    throw new Error('Failed to fetch time tracking data.');
  }

  // Calculate stats
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Use ISO week (Monday-based) for consistency with frontend
  const startOfWeek = new Date(today);
  const dayOfWeek = today.getDay();
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0, Sunday = 6
  startOfWeek.setDate(today.getDate() - daysToSubtract);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let todayTime = 0;
  let weekTime = 0;
  let monthTime = 0;
  const activityDays = new Set<string>();

  if (allSessions) {
    for (const session of allSessions) {
      if (!session.duration_seconds) continue;

      const startTime = new Date(session.start_time);
      const duration = session.duration_seconds;

      if (startTime >= today) {
        todayTime += duration;
      }
      if (startTime >= startOfWeek) {
        weekTime += duration;
      }
      if (startTime >= startOfMonth) {
        monthTime += duration;
      }

      activityDays.add(startTime.toDateString());
    }
  }

  // Calculate streak - count consecutive days with activity
  let streak = 0;
  if (activityDays.size > 0) {
    const currentDate = new Date(today);

    // If today has activity, start counting from today
    if (activityDays.has(currentDate.toDateString())) {
      while (activityDays.has(currentDate.toDateString())) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      }
    } else {
      // If today has no activity, check yesterday and count backwards
      currentDate.setDate(currentDate.getDate() - 1);
      while (activityDays.has(currentDate.toDateString())) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      }
    }
  }

  // Calculate daily activity for the past year (for heatmap)
  const dailyActivityMap = new Map<
    string,
    { duration: number; sessions: number }
  >();

  if (allSessions) {
    allSessions.forEach((session) => {
      if (!session.duration_seconds) return;

      const dateStr = new Date(session.start_time).toISOString().split('T')[0];
      if (!dateStr) return;

      const existing = dailyActivityMap.get(dateStr) || {
        duration: 0,
        sessions: 0,
      };
      dailyActivityMap.set(dateStr, {
        duration: existing.duration + session.duration_seconds,
        sessions: existing.sessions + 1,
      });
    });
  }

  const dailyActivity = Array.from(dailyActivityMap.entries()).map(
    ([date, data]) => ({
      date,
      duration: data.duration,
      sessions: data.sessions,
    })
  );

  const stats = {
    todayTime,
    weekTime,
    monthTime,
    streak,
    dailyActivity,
  };

  // Transform tasks to match the ExtendedWorkspaceTask interface expected by the time tracker
  const transformedTasks = (tasks || []).map((task: any) => ({
    ...task,
    // Flatten nested data for easier access
    board_id: task.list?.board?.id,
    board_name: task.list?.board?.name,
    list_id: task.list?.id,
    list_name: task.list?.name,
    list_status: task.list?.status,
    // Transform assignees to match expected format
    assignees: transformAssignees(task.assignees || []).map((user: any) => ({
      ...user,
      // Extract email from nested user_private_details
      email: user?.user_private_details?.[0]?.email || null,
    })),
    // Add current user assignment flag
    is_assigned_to_current_user:
      task.assignees?.some((a: any) => a.user?.id === userId) || false,
    // Ensure task is available for time tracking
    completed: false, // Since we filtered out archived tasks, none should be completed
  }));

  return {
    categories: categories || [],
    runningSession: runningSession || null,
    recentSessions: recentSessions || [],
    goals: goals || [],
    tasks: transformedTasks,
    stats,
  };
};
