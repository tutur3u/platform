import { createClient } from '@tuturuuu/supabase/next/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Calendar, Clock, TrendingUp, Zap } from '@tuturuuu/ui/icons';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { notFound } from 'next/navigation';
import { Fragment } from 'react';
import { ActivityHeatmap } from './components/activity-heatmap';

const formatDuration = (seconds: number | undefined): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default async function TimeTrackerPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const user = await getCurrentSupabaseUser();
  const supabase = await createClient();
  const { wsId } = await params;

  if (!user) return notFound();

  const { data: sessions } = await supabase
    .from('time_tracking_sessions')
    .select('start_time, duration_seconds')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
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
    <Fragment>
      {/* Stats Overview - Enhanced for sidebar */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg sm:text-xl">
                Your Progress
              </CardTitle>
              <CardDescription>
                Track your productivity metrics ⚡
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Custom sidebar-optimized stats layout */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Today */}
            <div className="rounded-lg border border-dynamic-blue/30 bg-background p-3 transition-all duration-300 hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-dynamic-blue/10 p-2 shadow-sm">
                  <Calendar className="h-4 w-4 text-blue-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-muted-foreground text-xs">
                      Today
                    </p>
                    <span className="text-sm">
                      {new Date().getDay() === 0 || new Date().getDay() === 6
                        ? '🏖️'
                        : '💼'}
                    </span>
                  </div>
                  <p className="text-muted-foreground/80 text-xs">
                    {new Date().toLocaleDateString('en-US', {
                      weekday: 'long',
                    })}
                  </p>
                  <p className="font-bold text-lg">
                    {formatDuration(stats.todayTime)}
                  </p>
                </div>
              </div>
            </div>

            {/* This Week */}
            <div className="rounded-lg border border-dynamic-green/30 bg-background p-3 transition-all duration-300 hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-dynamic-green/10 p-2 shadow-sm">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-muted-foreground text-xs">
                      This Week
                    </p>
                    <span className="text-sm">📊</span>
                  </div>
                  <p className="text-muted-foreground/80 text-xs">
                    {(() => {
                      const today = new Date();
                      const dayOfWeek = today.getDay();
                      const daysToSubtract =
                        dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                      const startOfWeek = new Date(today);
                      startOfWeek.setDate(today.getDate() - daysToSubtract);
                      const endOfWeek = new Date(startOfWeek);
                      endOfWeek.setDate(startOfWeek.getDate() + 6);
                      return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                    })()}
                  </p>
                  <p className="font-bold text-lg">
                    {formatDuration(stats.weekTime)}
                  </p>
                </div>
              </div>
            </div>

            {/* This Month */}
            <div className="rounded-lg border border-dynamic-purple/30 bg-background p-3 transition-all duration-300 hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-dynamic-purple/10 p-2 shadow-sm">
                  <Zap className="h-4 w-4 text-purple-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-muted-foreground text-xs">
                      This Month
                    </p>
                    <span className="text-sm">🚀</span>
                  </div>
                  <p className="text-muted-foreground/80 text-xs">
                    {new Date().toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                  <p className="font-bold text-lg">
                    {formatDuration(stats.monthTime)}
                  </p>
                </div>
              </div>
            </div>

            {/* Streak */}
            <div className="rounded-lg border border-dynamic-orange/30 bg-background p-3 transition-all duration-300 hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-dynamic-orange/10 p-2 shadow-sm">
                  <Clock className="h-4 w-4 text-orange-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-muted-foreground text-xs">
                      Streak
                    </p>
                    <span className="text-sm">
                      {stats.streak >= 7 ? '🏆' : '⭐'}
                    </span>
                  </div>
                  <p className="text-muted-foreground/80 text-xs">
                    {stats.streak > 0 ? 'consecutive days' : 'start today!'}
                  </p>
                  <p className="font-bold text-lg">{stats.streak} days</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Heatmap - Enhanced with better header */}
      {stats.dailyActivity && (
        <Card className="relative overflow-visible">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg sm:text-xl">
                  Activity Heatmap
                </CardTitle>
                <CardDescription>
                  {(() => {
                    const totalDuration =
                      stats.dailyActivity?.reduce(
                        (sum, day) => sum + day.duration,
                        0
                      ) || 0;
                    return totalDuration > 0
                      ? `${formatDuration(totalDuration)} tracked this year 🔥`
                      : 'Start tracking to see your activity pattern 🌱';
                  })()}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Remove the original header from ActivityHeatmap component and provide overflow space */}
            <div className="relative overflow-visible [&>div>div:first-child]:hidden">
              <ActivityHeatmap dailyActivity={stats.dailyActivity} />
            </div>
          </CardContent>
        </Card>
      )}
    </Fragment>
  );
}
