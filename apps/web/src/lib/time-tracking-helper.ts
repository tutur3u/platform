'use server';

import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { transformAssignees } from '@/lib/task-helper';
import type { Task } from '@tuturuuu/types/src/primitives/Task';
import type { User } from '@tuturuuu/types/src/primitives/User';
import 'server-only';

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
  const transformedTasks = (tasks || []).map((task: Task) => ({
    ...task,
    // Flatten nested data for easier access
    board_id: task.list?.board?.id,
    board_name: task.list?.board?.name,
    list_id: task.list?.id,
    list_name: task.list?.name,
    list_status: task.list?.status,
    // Transform assignees to match expected format
    assignees: transformAssignees(task.assignees || []).map((user: User) => ({
      ...user,
      // Extract email from nested user_private_details
      email: user?.user_private_details?.[0]?.email || null,
    })),
    // Add current user assignment flag
    is_assigned_to_current_user:
      task.assignees?.some((a: { user: User }) => a.user?.id === userId) || false,
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
