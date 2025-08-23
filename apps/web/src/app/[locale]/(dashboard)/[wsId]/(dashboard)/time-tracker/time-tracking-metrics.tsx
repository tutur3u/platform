import { createClient } from '@tuturuuu/supabase/next/server';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Clock, Target, Timer, TrendingUp, Zap } from '@tuturuuu/ui/icons';
import Link from 'next/link';

interface TimeTrackingMetricsProps {
  wsId: string;
  userId: string;
}

export default async function TimeTrackingMetrics({
  wsId,
  userId,
}: TimeTrackingMetricsProps) {
  const supabase = await createClient();

  // Get time tracking data for the current user
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(today);
  const dayOfWeek = today.getDay();
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(today.getDate() - daysToSubtract);

  const [
    { data: todayData },
    { data: weekData },
    { data: runningSession },
    { data: recentSessions },
  ] = await Promise.all([
    // Today's sessions
    supabase
      .from('time_tracking_sessions')
      .select(
        'duration_seconds, category:time_tracking_categories(name, color)'
      )
      .eq('ws_id', wsId)
      .eq('user_id', userId)
      .gte('start_time', today.toISOString())
      .not('duration_seconds', 'is', null),

    // This week's sessions
    supabase
      .from('time_tracking_sessions')
      .select(
        'duration_seconds, category:time_tracking_categories(name, color)'
      )
      .eq('ws_id', wsId)
      .eq('user_id', userId)
      .gte('start_time', startOfWeek.toISOString())
      .not('duration_seconds', 'is', null),

    // Currently running session
    supabase
      .from('time_tracking_sessions')
      .select(
        '*, category:time_tracking_categories(name, color), task:tasks(name)'
      )
      .eq('ws_id', wsId)
      .eq('user_id', userId)
      .eq('is_running', true)
      .single(),

    // Recent sessions for productivity calculation
    supabase
      .from('time_tracking_sessions')
      .select('duration_seconds, start_time, was_resumed')
      .eq('ws_id', wsId)
      .eq('user_id', userId)
      .not('duration_seconds', 'is', null)
      .order('start_time', { ascending: false })
      .limit(10),
  ]);

  // Calculate metrics
  const todayTime =
    todayData?.reduce(
      (sum, session) => sum + (session.duration_seconds || 0),
      0
    ) || 0;
  const weekTime =
    weekData?.reduce(
      (sum, session) => sum + (session.duration_seconds || 0),
      0
    ) || 0;

  // Calculate streak (consecutive days with activity)
  let streak = 0;
  if (recentSessions && recentSessions.length > 0) {
    const uniqueDays = new Set<string>();
    const currentDate = new Date(today);

    for (let i = 0; i < 30; i++) {
      const dayStr = currentDate.toISOString().split('T')[0];
      const hasActivity = recentSessions.some((session) =>
        session.start_time?.startsWith(dayStr || '')
      );

      if (hasActivity) {
        uniqueDays.add(dayStr || '');
        if (currentDate <= today) {
          streak++;
        }
      } else if (currentDate <= today) {
        break;
      }

      currentDate.setDate(currentDate.getDate() - 1);
    }
  }

  // Calculate productivity score
  const calculateProductivityScore = () => {
    if (!recentSessions || recentSessions.length === 0) return 0;

    let totalScore = 0;
    for (const session of recentSessions) {
      const duration = session.duration_seconds || 0;
      const durationScore = Math.min(duration / 7200, 1) * 40; // Max 40 points for 2+ hours
      const consistencyBonus = session.was_resumed === true ? 0 : 20;
      const sessionScore = Math.min(durationScore + consistencyBonus, 100);
      totalScore += sessionScore;
    }

    return Math.round(totalScore / recentSessions.length);
  };

  const productivityScore = calculateProductivityScore();

  // Format duration helper
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getProductivityColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 60) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (score >= 40) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getProductivityLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Average';
    return 'Needs Improvement';
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="font-semibold text-base">
          ⏰ Time Tracking Metrics
        </CardTitle>
        <Link href={`/${wsId}/time-tracker`}>
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <Timer className="mr-1 h-3 w-3" />
            View Tracker
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Currently Running Session */}
        {runningSession && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              <span className="font-medium text-green-700 text-sm">
                Currently Active
              </span>
            </div>
            <p className="text-green-600 text-sm">
              {runningSession.task?.name ||
                runningSession.category?.name ||
                'Untitled Session'}
            </p>
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Clock className="h-3 w-3" />
              Today
            </div>
            <p className="font-medium text-sm">
              {todayTime > 0 ? formatDuration(todayTime) : '0m'}
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <TrendingUp className="h-3 w-3" />
              This Week
            </div>
            <p className="font-medium text-sm">
              {weekTime > 0 ? formatDuration(weekTime) : '0m'}
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Target className="h-3 w-3" />
              Streak
            </div>
            <p className="font-medium text-sm">
              {streak} day{streak !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Zap className="h-3 w-3" />
              Focus Score
            </div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm">{productivityScore}</p>
              <Badge
                className={`text-xs ${getProductivityColor(productivityScore)}`}
              >
                {getProductivityLabel(productivityScore)}
              </Badge>
            </div>
          </div>
        </div>

        {/* Top Categories Today */}
        {todayData && todayData.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-muted-foreground text-xs">
              Today's Focus
            </h4>
            <div className="space-y-1">
              {todayData
                .reduce(
                  (
                    acc: Array<{
                      name: string;
                      duration: number;
                      color: string;
                    }>,
                    session
                  ) => {
                    const categoryName =
                      session.category?.name || 'Uncategorized';
                    const existing = acc.find(
                      (item) => item.name === categoryName
                    );
                    if (existing) {
                      existing.duration += session.duration_seconds || 0;
                    } else {
                      acc.push({
                        name: categoryName,
                        duration: session.duration_seconds || 0,
                        color: session.category?.color || 'GRAY',
                      });
                    }
                    return acc;
                  },
                  []
                )
                .sort((a, b) => b.duration - a.duration)
                .slice(0, 3)
                .map((category) => (
                  <div
                    key={category.name}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-muted-foreground">
                      {category.name}
                    </span>
                    <span className="font-medium">
                      {formatDuration(category.duration)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* No Data State */}
        {todayTime === 0 && weekTime === 0 && !runningSession && (
          <div className="py-4 text-center text-muted-foreground">
            <div className="mb-2">
              <Timer className="mx-auto h-6 w-6 opacity-50" />
            </div>
            <p className="text-sm">No time tracked yet</p>
            <p className="text-xs">
              Start a timer to see your productivity metrics
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
