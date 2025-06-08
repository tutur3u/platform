'use server';

import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
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

  const tasksPromise = sbAdmin.from('tasks').select('*').limit(100);

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
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
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

  // Calculate streak
  let streak = 0;
  if (activityDays.size > 0) {
    let currentDate = new Date(today);
    while (activityDays.has(currentDate.toDateString())) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    }
  }

  const stats = {
    todayTime,
    weekTime,
    monthTime,
    streak,
  };

  return {
    categories: categories || [],
    runningSession: runningSession || null,
    recentSessions: recentSessions || [],
    goals: goals || [],
    tasks: tasks || [],
    stats,
  };
};
