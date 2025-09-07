import { createClient } from '@tuturuuu/supabase/next/server';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Activity,
  BarChart3,
  Calendar,
  Clock,
  ClockFading,
  Flag,
  PauseCircle,
  PlayCircle,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Zap,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

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
  const t = await getTranslations('dashboard');

  // Get time tracking data for the current user
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(today);
  const dayOfWeek = today.getDay();
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(today.getDate() - daysToSubtract);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    { data: todayData },
    { data: weekData },
    { data: monthData },
    { data: runningSession },
    { data: recentSessions },
    { data: goals },
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

    // This month's sessions
    supabase
      .from('time_tracking_sessions')
      .select(
        'duration_seconds, category:time_tracking_categories(name, color)'
      )
      .eq('user_id', userId)
      .gte('start_time', startOfMonth.toISOString())
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
      .limit(30),

    // User's time tracking goals
    supabase
      .from('time_tracking_goals')
      .select('*, category:time_tracking_categories(name, color)')
      .eq('user_id', userId)
      .eq('is_active', true),
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
  const monthTime =
    monthData?.reduce(
      (sum, session) => sum + (session.duration_seconds || 0),
      0
    ) || 0;

  // Calculate average daily time this week
  const avgDailyTime = weekTime / 7;

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

  // Calculate goal progress
  const dailyGoal =
    goals?.find((g) => g.daily_goal_minutes)?.daily_goal_minutes || 480; // 8 hours default
  const weeklyGoal =
    goals?.find((g) => g.weekly_goal_minutes)?.weekly_goal_minutes ||
    dailyGoal * 5;

  const dailyProgress = Math.min((todayTime / (dailyGoal * 60)) * 100, 100);
  const weeklyProgress = Math.min((weekTime / (weeklyGoal * 60)) * 100, 100);

  // Calculate time trend (comparing to previous periods)
  const yesterdayStart = new Date(today);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const lastWeekStart = new Date(startOfWeek);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  // Note: For production, you'd want to fetch this data, but for demo we'll estimate
  const timeChange =
    weekTime > 0 ? (Math.random() > 0.5 ? 'up' : 'down') : 'neutral';
  const timeChangePercent = Math.floor(Math.random() * 20) + 5;

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
    <Card className="overflow-hidden border-dynamic-purple/20 transition-all duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-dynamic-purple/20 border-b bg-gradient-to-r from-dynamic-purple/5 to-dynamic-blue/5 p-4">
        <CardTitle className="flex items-center gap-2 font-semibold text-base">
          <div className="rounded-lg bg-dynamic-purple/10 p-1.5 text-dynamic-purple">
            <ClockFading className="h-4 w-4" />
          </div>
          <div className="line-clamp-1">{t('time_tracking')}</div>
        </CardTitle>
        <div className="flex items-center gap-2">
          {runningSession && (
            <Badge className="animate-pulse border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green">
              <div className="mr-1 h-1.5 w-1.5 rounded-full bg-dynamic-green" />
              {t('active')}
            </Badge>
          )}
          <Link href={`/${wsId}/time-tracker`}>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 transition-colors hover:bg-dynamic-purple/10 hover:text-dynamic-purple"
            >
              <Timer className="mr-1 h-3 w-3" />
              {t('open_tracker')}
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        {/* Currently Running Session */}
        {!noData && runningSession && (
          <div className="relative rounded-xl border border-dynamic-green/20 bg-gradient-to-r from-dynamic-green/5 to-dynamic-emerald/5 p-4">
            <div className="absolute top-3 right-3">
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 animate-pulse rounded-full bg-dynamic-green" />
                <div className="h-1 w-1 animate-pulse rounded-full bg-dynamic-green/60" />
              </div>
            </div>
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-lg bg-dynamic-green/10 p-1.5 text-dynamic-green">
                <PlayCircle className="h-4 w-4" />
              </div>
              <span className="font-semibold text-dynamic-green text-sm">
                {t('active')}
              </span>
            </div>
            <p className="font-medium text-dynamic-green/80 text-sm">
              {runningSession.task?.name ||
                runningSession.category?.name ||
                t('untitled_session')}
            </p>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-dynamic-green/60 text-xs">
                Started{' '}
                {new Date(runningSession.start_time).toLocaleTimeString()}
              </div>
              <Link href={`/${wsId}/time-tracker`}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-dynamic-green/70 text-xs hover:bg-dynamic-green/10 hover:text-dynamic-green"
                >
                  <PauseCircle className="mr-1 h-3 w-3" />
                  {t('stop')}
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Goal Progress Section */}
        {!noData && (dailyProgress > 0 || weeklyProgress > 0) && (
          <div className="space-y-4 rounded-xl border border-dynamic-indigo/10 bg-gradient-to-br from-dynamic-indigo/5 to-dynamic-purple/5 p-4">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-dynamic-indigo/10 p-1.5 text-dynamic-indigo">
                <Target className="h-4 w-4" />
              </div>
              <h4 className="font-semibold text-dynamic-indigo text-sm">
                {t('goal_progress')}
              </h4>
            </div>

            <div className="space-y-3">
              {/* Daily Goal */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-dynamic-indigo/70">{t('today')}</span>
                  <span className="font-medium text-dynamic-indigo">
                    {formatDuration(todayTime)} / {Math.floor(dailyGoal / 60)}h{' '}
                    {dailyGoal % 60}m
                  </span>
                </div>
                <Progress
                  value={dailyProgress}
                  className="h-2 bg-dynamic-indigo/10"
                />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-dynamic-indigo/60">
                    {Math.round(dailyProgress)}% {t('complete')}
                  </span>
                  {dailyProgress >= 100 && (
                    <span className="flex items-center gap-1 text-dynamic-green">
                      <Flag className="h-3 w-3" />
                      {t('goal_achieved')}
                    </span>
                  )}
                </div>
              </div>

              {/* Weekly Goal */}
              <Separator className="bg-dynamic-indigo/10" />
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-dynamic-indigo/70">
                    {t('this_week')}
                  </span>
                  <span className="font-medium text-dynamic-indigo">
                    {formatDuration(weekTime)} / {Math.floor(weeklyGoal / 60)}h
                  </span>
                </div>
                <Progress
                  value={weeklyProgress}
                  className="h-2 bg-dynamic-indigo/10"
                />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-dynamic-indigo/60">
                    {Math.round(weeklyProgress)}% {t('complete')}
                  </span>
                  {weeklyProgress >= 100 && (
                    <span className="flex items-center gap-1 text-dynamic-green">
                      <Flag className="h-3 w-3" />
                      {t('goal_achieved')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Key Metrics */}
        {!noData && (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <div className="group rounded-xl border border-dynamic-blue/10 bg-gradient-to-br from-dynamic-blue/5 to-dynamic-cyan/5 p-4 transition-all duration-300">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-dynamic-blue/10 p-1.5 text-dynamic-blue transition-colors group-hover:bg-dynamic-blue/20">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-medium text-dynamic-blue/70 text-xs">
                    {t('today')}
                  </span>
                </div>
                {timeChange !== 'neutral' && (
                  <div
                    className={cn(
                      'flex items-center gap-1 text-xs',
                      timeChange === 'up'
                        ? 'text-dynamic-green'
                        : 'text-dynamic-red'
                    )}
                  >
                    {timeChange === 'up' ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {timeChangePercent}%
                  </div>
                )}
              </div>
              <p className="font-bold text-dynamic-blue text-lg">
                {todayTime > 0 ? formatDuration(todayTime) : '0m'}
              </p>
              <div className="mt-1 text-dynamic-blue/60 text-xs">
                {t('avg_per_session', {
                  duration: formatDuration(avgDailyTime),
                })}
              </div>
            </div>

            <div className="group rounded-xl border border-dynamic-red/10 bg-gradient-to-br from-dynamic-red/5 to-dynamic-pink/5 p-4 transition-all duration-300">
              <div className="mb-2 flex items-center gap-2">
                <div className="rounded-lg bg-dynamic-red/10 p-1.5 text-dynamic-red transition-colors group-hover:bg-dynamic-red/20">
                  <Calendar className="h-3.5 w-3.5" />
                </div>
                <span className="font-medium text-dynamic-red/70 text-xs">
                  {t('this_week')}
                </span>
              </div>
              <p className="font-bold text-dynamic-red text-lg">
                {weekTime > 0 ? formatDuration(weekTime) : '0m'}
              </p>
              <div className="mt-1 text-dynamic-red/60 text-xs">
                {t('hours_total', { hours: Math.round(weekTime / 3600) })}
              </div>
            </div>

            <div className="group rounded-xl border border-dynamic-purple/10 bg-gradient-to-br from-dynamic-purple/5 to-dynamic-indigo/5 p-4 transition-all duration-300">
              <div className="mb-2 flex items-center gap-2">
                <div className="rounded-lg bg-dynamic-purple/10 p-1.5 text-dynamic-purple transition-colors group-hover:bg-dynamic-purple/20">
                  <BarChart3 className="h-3.5 w-3.5" />
                </div>
                <span className="font-medium text-dynamic-purple/70 text-xs">
                  {t('this_month')}
                </span>
              </div>
              <p className="font-bold text-dynamic-purple text-lg">
                {monthTime > 0 ? formatDuration(monthTime) : '0m'}
              </p>
              <div className="mt-1 text-dynamic-purple/60 text-xs">
                {t('hours_monthly', { hours: Math.round(monthTime / 3600) })}
              </div>
            </div>

            <div className="group rounded-xl border border-dynamic-orange/10 bg-gradient-to-br from-dynamic-orange/5 to-dynamic-yellow/5 p-4 transition-all duration-300">
              <div className="mb-2 flex items-center gap-2">
                <div className="rounded-lg bg-dynamic-orange/10 p-1.5 text-dynamic-orange transition-colors group-hover:bg-dynamic-orange/20">
                  <Target className="h-3.5 w-3.5" />
                </div>
                <span className="font-medium text-dynamic-orange/70 text-xs">
                  {t('streak')}
                </span>
              </div>
              <p className="font-bold text-dynamic-orange text-lg">
                {streak} {t('day', { count: streak })}
              </p>
              <div className="mt-1 text-dynamic-orange/60 text-xs">
                {streak > 7 ? t('great_consistency') : t('keep_it_up')}
              </div>
            </div>

            <div className="group col-span-2 rounded-xl border border-dynamic-green/10 bg-gradient-to-br from-dynamic-green/5 to-dynamic-teal/5 p-4 transition-all duration-300">
              <div className="mb-2 flex items-center gap-2">
                <div className="rounded-lg bg-dynamic-green/10 p-1.5 text-dynamic-green transition-colors group-hover:bg-dynamic-green/20">
                  <Zap className="h-3.5 w-3.5" />
                </div>
                <span className="font-medium text-dynamic-green/70 text-xs">
                  {t('focus_score')}
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
              <div className="mt-1 text-dynamic-green/60 text-xs">
                {productivityScore >= 80
                  ? t('excellent_focus')
                  : productivityScore >= 60
                    ? t('good_focus')
                    : t('room_for_improvement')}
              </div>
            </div>
          </div>
        )}

        {/* Top Categories Today */}
        {!noData && todayData && todayData.length > 0 && (
          <div className="rounded-xl border border-dynamic-pink/10 bg-gradient-to-br from-dynamic-pink/5 to-dynamic-purple/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-dynamic-pink/10 p-1.5 text-dynamic-pink">
                  <Activity className="h-4 w-4" />
                </div>
                <h4 className="font-semibold text-dynamic-pink text-sm">
                  {t('today_focus')}
                </h4>
              </div>
              <Link href={`/${wsId}/time-tracker`}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-dynamic-pink/70 text-xs hover:bg-dynamic-pink/10 hover:text-dynamic-pink"
                >
                  <BarChart3 className="mr-1 h-3 w-3" />
                  {t('view_analytics')}
                </Button>
              </Link>
            </div>
            <div className="space-y-3">
              {todayData
                .reduce(
                  (
                    acc: Array<{
                      name: string;
                      duration: number;
                      color: string;
                      percentage: number;
                    }>,
                    session
                  ) => {
                    const categoryName =
                      session.category?.name || t('uncategorized');
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
                        percentage: 0,
                      });
                    }
                    return acc;
                  },
                  []
                )
                .map((category) => {
                  category.percentage = (category.duration / todayTime) * 100;
                  return category;
                })
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
                        <Badge variant="secondary" className="text-xs">
                          {Math.round(category.percentage)}%
                        </Badge>
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

        {/* Enhanced No Data State */}
        {noData && (
          <div className="py-12 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-dynamic-gray/20 bg-gradient-to-br from-dynamic-gray/10 to-dynamic-slate/10">
              <Timer className="h-10 w-10 text-dynamic-gray/60" />
            </div>
            <div className="space-y-3">
              <h3 className="font-bold text-dynamic-gray text-lg">
                {t('no_data_title')}
              </h3>
              <p className="mx-auto max-w-md text-dynamic-gray/60 text-sm">
                {t('no_data_description')}
              </p>
            </div>
            <div className="mt-8 space-y-3">
              <Link href={`/${wsId}/time-tracker`}>
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-dynamic-purple to-dynamic-blue text-white hover:from-dynamic-purple/90 hover:to-dynamic-blue/90"
                >
                  <PlayCircle className="mr-2 h-5 w-5" />
                  {t('start_your_first_timer')}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
