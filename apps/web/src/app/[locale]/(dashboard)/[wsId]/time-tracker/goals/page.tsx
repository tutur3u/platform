import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GoalManager } from '../components/goal-manager';

export const metadata: Metadata = {
  title: 'Goals',
  description:
    'Manage Goals in the Time Tracker area of your Tuturuuu workspace.',
};

export default async function TimeTrackerGoalsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const user = await getCurrentSupabaseUser();
  const supabase = await createClient();
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
  const wsId = workspace.id;

  if (!user) return notFound();

  const { data: goals } = await supabase
    .from('time_tracking_goals')
    .select('*, category:time_tracking_categories(*)')
    .eq('ws_id', wsId)
    .eq('user_id', user.id);

  const { data: categories } = await supabase
    .from('time_tracking_categories')
    .select('*')
    .eq('ws_id', wsId);

  // Stats are more complex and require processing, which we'll do after fetching
  // Filter out sessions with pending_approval=true (they haven't been approved yet)
  const { data: sessions } = await supabase
    .from('time_tracking_sessions')
    .select('start_time, duration_seconds')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .eq('pending_approval', false)
    .not('duration_seconds', 'is', null);

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

  if (sessions) {
    for (const session of sessions) {
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

  if (sessions) {
    sessions.forEach((session) => {
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

  return (
    <GoalManager
      wsId={wsId}
      goals={goals}
      categories={categories}
      timerStats={stats}
    />
  );
}
