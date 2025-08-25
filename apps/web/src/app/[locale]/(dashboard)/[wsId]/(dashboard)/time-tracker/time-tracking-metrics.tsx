import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Activity,
  Clock,
  ClockFading,
  PlayCircle,
  Target,
  Timer,
  TrendingUp,
  Zap,
} from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';

interface TimeTrackingMetricsProps {
  wsId: string;
  userId: string;
  isPersonal?: boolean;
}

export default async function TimeTrackingMetrics({
  wsId,
  userId,
  // isPersonal = false,
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
      .eq('user_id', userId)
      .gte('start_time', today.toISOString())
      .not('duration_seconds', 'is', null),

    // This week's sessions
    supabase
      .from('time_tracking_sessions')
      .select(
        'duration_seconds, category:time_tracking_categories(name, color)'
      )
      .eq('user_id', userId)
      .gte('start_time', startOfWeek.toISOString())
      .not('duration_seconds', 'is', null),

    // Currently running session
    supabase
      .from('time_tracking_sessions')
      .select(
        '*, category:time_tracking_categories(name, color), task:tasks(name)'
      )
      .eq('user_id', userId)
      .eq('is_running', true)
      .single(),

    // Recent sessions for productivity calculation
    supabase
      .from('time_tracking_sessions')
      .select('duration_seconds, start_time, was_resumed')
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

  // Determine if there is no data across all metrics
  const noData =
    todayTime === 0 &&
    weekTime === 0 &&
    streak === 0 &&
    productivityScore === 0;

  // Format duration helper
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <Card className="overflow-hidden border-dynamic-purple/20 transition-all duration-300 hover:shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-dynamic-purple/10 border-b bg-gradient-to-r from-dynamic-purple/5 to-dynamic-blue/5 pb-3">
        <CardTitle className="flex items-center gap-2 font-semibold text-base">
          <div className="rounded-lg bg-dynamic-purple/10 p-1.5 text-dynamic-purple">
            <ClockFading className="h-4 w-4" />
          </div>
          <div className="line-clamp-1">Time Tracking</div>
        </CardTitle>
        <Link href={`/${wsId}/time-tracker`}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 transition-colors hover:bg-dynamic-purple/10 hover:text-dynamic-purple"
          >
            <Timer className="mr-1 h-3 w-3" />
            View Tracker
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        {/* Currently Running Session */}
        {!noData && runningSession && (
          <div className="relative rounded-xl border border-dynamic-green/20 bg-gradient-to-r from-dynamic-green/5 to-dynamic-emerald/5 p-4 shadow-sm">
            <div className="absolute top-3 right-3">
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 animate-pulse rounded-full bg-dynamic-green shadow-dynamic-green/30 shadow-lg" />
                <div className="h-1 w-1 animate-pulse rounded-full bg-dynamic-green/60" />
              </div>
            </div>
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-lg bg-dynamic-green/10 p-1.5 text-dynamic-green">
                <PlayCircle className="h-4 w-4" />
              </div>
              <span className="font-semibold text-dynamic-green text-sm">
                Currently Active
              </span>
            </div>
            <p className="font-medium text-dynamic-green/80 text-sm">
              {runningSession.task?.name ||
                runningSession.category?.name ||
                'Untitled Session'}
            </p>
            <div className="mt-2 text-dynamic-green/60 text-xs">
              Timer is running...
            </div>
          </div>
        )}

        {/* Key Metrics */}
        {!noData && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="group rounded-xl border border-dynamic-blue/10 bg-gradient-to-br from-dynamic-blue/5 to-dynamic-cyan/5 p-4 transition-all duration-300 hover:shadow-dynamic-blue/10 hover:shadow-md">
              <div className="mb-2 flex items-center gap-2">
                <div className="rounded-lg bg-dynamic-blue/10 p-1.5 text-dynamic-blue transition-colors group-hover:bg-dynamic-blue/20">
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <span className="font-medium text-dynamic-blue/70 text-xs">
                  Today
                </span>
              </div>
              <p className="font-bold text-dynamic-blue text-lg">
                {todayTime > 0 ? formatDuration(todayTime) : '0m'}
              </p>
            </div>

            <div className="group rounded-xl border border-dynamic-red/10 bg-gradient-to-br from-dynamic-red/5 to-dynamic-pink/5 p-4 transition-all duration-300 hover:shadow-dynamic-red/10 hover:shadow-md">
              <div className="mb-2 flex items-center gap-2">
                <div className="rounded-lg bg-dynamic-red/10 p-1.5 text-dynamic-red transition-colors group-hover:bg-dynamic-red/20">
                  <TrendingUp className="h-3.5 w-3.5" />
                </div>
                <span className="font-medium text-dynamic-red/70 text-xs">
                  This Week
                </span>
              </div>
              <p className="font-bold text-dynamic-red text-lg">
                {weekTime > 0 ? formatDuration(weekTime) : '0m'}
              </p>
            </div>

            <div className="group rounded-xl border border-dynamic-orange/10 bg-gradient-to-br from-dynamic-orange/5 to-dynamic-yellow/5 p-4 transition-all duration-300 hover:shadow-dynamic-orange/10 hover:shadow-md">
              <div className="mb-2 flex items-center gap-2">
                <div className="rounded-lg bg-dynamic-orange/10 p-1.5 text-dynamic-orange transition-colors group-hover:bg-dynamic-orange/20">
                  <Target className="h-3.5 w-3.5" />
                </div>
                <span className="font-medium text-dynamic-orange/70 text-xs">
                  Streak
                </span>
              </div>
              <p className="font-bold text-dynamic-orange text-lg">
                {streak} day{streak !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="group rounded-xl border border-dynamic-green/10 bg-gradient-to-br from-dynamic-green/5 to-dynamic-teal/5 p-4 transition-all duration-300 hover:shadow-dynamic-green/10 hover:shadow-md">
              <div className="mb-2 flex items-center gap-2">
                <div className="rounded-lg bg-dynamic-green/10 p-1.5 text-dynamic-green transition-colors group-hover:bg-dynamic-green/20">
                  <Zap className="h-3.5 w-3.5" />
                </div>
                <span className="font-medium text-dynamic-green/70 text-xs">
                  Focus Score
                </span>
              </div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-dynamic-green text-lg">
                  {productivityScore}
                </p>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-dynamic-green/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-dynamic-green to-dynamic-teal transition-all duration-500"
                    style={{ width: `${Math.min(productivityScore, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top Categories Today */}
        {!noData && todayData && todayData.length > 0 && (
          <div className="rounded-xl border border-dynamic-pink/10 bg-gradient-to-br from-dynamic-pink/5 to-dynamic-purple/5 p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-lg bg-dynamic-pink/10 p-1.5 text-dynamic-pink">
                <Activity className="h-4 w-4" />
              </div>
              <h4 className="font-semibold text-dynamic-pink text-sm">
                Today's Focus
              </h4>
            </div>
            <div className="space-y-3">
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
                        color: session.category?.color || 'BLUE',
                      });
                    }
                    return acc;
                  },
                  []
                )
                .sort((a, b) => b.duration - a.duration)
                .slice(0, 3)
                .map((category) => {
                  const colorMap: { [key: string]: string } = {
                    RED: 'text-dynamic-red bg-dynamic-red/10 border-dynamic-red/20',
                    BLUE: 'text-dynamic-blue bg-dynamic-blue/10 border-dynamic-blue/20',
                    GREEN:
                      'text-dynamic-green bg-dynamic-green/10 border-dynamic-green/20',
                    YELLOW:
                      'text-dynamic-yellow bg-dynamic-yellow/10 border-dynamic-yellow/20',
                    PURPLE:
                      'text-dynamic-purple bg-dynamic-purple/10 border-dynamic-purple/20',
                    PINK: 'text-dynamic-pink bg-dynamic-pink/10 border-dynamic-pink/20',
                    ORANGE:
                      'text-dynamic-orange bg-dynamic-orange/10 border-dynamic-orange/20',
                  };
                  const colorClass =
                    colorMap[category.color] ||
                    'text-dynamic-blue bg-dynamic-blue/10 border-dynamic-blue/20';

                  return (
                    <div
                      key={category.name}
                      className={cn(
                        'flex items-center justify-between rounded-lg border p-3 backdrop-blur-sm',
                        colorClass
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-sm">
                          {category.name}
                        </span>
                      </div>
                      <span className="font-semibold text-sm">
                        {formatDuration(category.duration)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* No Data State */}
        {noData && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-dynamic-gray/20 bg-gradient-to-br from-dynamic-gray/10 to-dynamic-slate/10">
              <Timer className="h-8 w-8 text-dynamic-gray/60" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-base text-dynamic-gray">
                No time tracked yet
              </h3>
              <p className="mx-auto max-w-xs text-dynamic-gray/60 text-sm">
                Start tracking your time to see detailed productivity metrics
                and insights
              </p>
            </div>
            <div className="mt-6">
              <Link href={`/${wsId}/time-tracker`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-dynamic-blue/20 text-dynamic-blue transition-all duration-200 hover:border-dynamic-blue/30 hover:bg-dynamic-blue/10"
                >
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Start Tracking
                </Button>
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
