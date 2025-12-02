import {
  Activity,
  ArrowRight,
  BarChart3,
  Calendar,
  Clock,
  ClockFading,
  Flame,
  PauseCircle,
  PlayCircle,
  Sparkles,
  Target,
  Zap,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

interface TimeTrackingMetricsProps {
  wsId: string;
  userId: string;
  isPersonal?: boolean;
}

export default async function TimeTrackingMetrics({
  wsId,
  userId,
}: TimeTrackingMetricsProps) {
  const supabase = await createClient();
  const t = await getTranslations('dashboard');

  // Get time tracking data
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
    { data: goals },
  ] = await Promise.all([
    supabase
      .from('time_tracking_sessions')
      .select(
        'duration_seconds, category:time_tracking_categories(name, color)'
      )
      .eq('user_id', userId)
      .gte('start_time', today.toISOString())
      .not('duration_seconds', 'is', null),
    supabase
      .from('time_tracking_sessions')
      .select(
        'duration_seconds, category:time_tracking_categories(name, color)'
      )
      .eq('user_id', userId)
      .gte('start_time', startOfWeek.toISOString())
      .not('duration_seconds', 'is', null),
    supabase
      .from('time_tracking_sessions')
      .select(
        '*, category:time_tracking_categories(name, color), task:tasks(name)'
      )
      .eq('user_id', userId)
      .eq('is_running', true)
      .single(),
    supabase
      .from('time_tracking_sessions')
      .select('duration_seconds, start_time, was_resumed')
      .eq('user_id', userId)
      .not('duration_seconds', 'is', null)
      .order('start_time', { ascending: false })
      .limit(30),
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

  // Calculate streak
  let streak = 0;
  if (recentSessions && recentSessions.length > 0) {
    const currentDate = new Date(today);
    for (let i = 0; i < 30; i++) {
      const dayStr = currentDate.toISOString().split('T')[0];
      const hasActivity = recentSessions.some((session) =>
        session.start_time?.startsWith(dayStr || '')
      );
      if (hasActivity && currentDate <= today) {
        streak++;
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
      const durationScore = Math.min(duration / 7200, 1) * 40;
      const consistencyBonus = session.was_resumed === true ? 0 : 20;
      totalScore += Math.min(durationScore + consistencyBonus, 100);
    }
    return Math.round(totalScore / recentSessions.length);
  };

  const productivityScore = calculateProductivityScore();

  // Goals
  const dailyGoal =
    goals?.find((g) => g.daily_goal_minutes)?.daily_goal_minutes || 480;
  const weeklyGoal =
    goals?.find((g) => g.weekly_goal_minutes)?.weekly_goal_minutes ||
    dailyGoal * 5;

  const dailyProgress = Math.min((todayTime / (dailyGoal * 60)) * 100, 100);
  const weeklyProgress = Math.min((weekTime / (weeklyGoal * 60)) * 100, 100);

  const hasNoSessions = !recentSessions || recentSessions.length === 0;

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <Card className="group overflow-hidden border-dynamic-purple/20 bg-linear-to-br from-card via-card to-dynamic-purple/5 shadow-lg ring-1 ring-dynamic-purple/10 transition-all duration-300 hover:border-dynamic-purple/30 hover:shadow-xl hover:ring-dynamic-purple/20">
      <CardHeader className="space-y-0 border-dynamic-purple/20 border-b bg-linear-to-r from-dynamic-purple/10 via-dynamic-purple/5 to-transparent p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 font-semibold text-base">
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-xl bg-dynamic-purple/20 blur-lg" />
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-purple via-dynamic-purple/90 to-dynamic-indigo shadow-lg ring-2 ring-dynamic-purple/30">
                <ClockFading className="h-5 w-5 text-white" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-bold">{t('time_tracking')}</span>
              <span className="font-medium text-dynamic-purple text-xs">
                {formatDuration(todayTime)} {t('today').toLowerCase()}
              </span>
            </div>
          </CardTitle>
          <div className="flex items-center gap-2">
            {runningSession && (
              <Badge className="animate-pulse gap-1.5 border-dynamic-green/30 bg-dynamic-green/15 px-2.5 py-1 font-medium text-dynamic-green shadow-sm ring-1 ring-dynamic-green/20">
                <div className="h-2 w-2 rounded-full bg-dynamic-green shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                {t('active')}
              </Badge>
            )}
            <Link href={`/${wsId}/time-tracker`}>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-dynamic-purple/30 bg-background/50 backdrop-blur-sm transition-all hover:border-dynamic-purple hover:bg-dynamic-purple/10 hover:text-dynamic-purple"
              >
                {t('open_tracker')}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {/* Running Session */}
        {runningSession && (
          <div className="group/session relative overflow-hidden rounded-xl border-2 border-dynamic-green/40 bg-linear-to-r from-dynamic-green/10 via-dynamic-green/5 to-transparent p-4 shadow-sm transition-all hover:border-dynamic-green/60 hover:shadow-md">
            <div className="absolute top-0 bottom-0 left-0 w-1.5 bg-dynamic-green" />
            <div className="absolute top-2 right-2 h-2 w-2 animate-pulse rounded-full bg-dynamic-green shadow-[0_0_12px_rgba(34,197,94,0.6)]" />
            <div className="pl-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-green/20 ring-1 ring-dynamic-green/30">
                    <PlayCircle className="h-4 w-4 text-dynamic-green" />
                  </div>
                  <div>
                    <span className="font-semibold text-dynamic-green text-sm">
                      {runningSession.task?.name ||
                        runningSession.category?.name ||
                        t('untitled_session')}
                    </span>
                    <p className="text-dynamic-green/60 text-xs">
                      Started{' '}
                      {new Date(runningSession.start_time).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <Link href={`/${wsId}/time-tracker`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 border-dynamic-green/40 bg-dynamic-green/10 px-3 font-medium text-dynamic-green transition-all hover:border-dynamic-green hover:bg-dynamic-green/20"
                  >
                    <PauseCircle className="h-4 w-4" />
                    {t('stop')}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Goal Progress */}
        {(dailyProgress > 0 || weeklyProgress > 0) && (
          <div className="space-y-4 rounded-xl border border-dynamic-indigo/20 bg-linear-to-br from-dynamic-indigo/5 via-transparent to-transparent p-4 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-dynamic-indigo/15 ring-1 ring-dynamic-indigo/25">
                <Target className="h-3.5 w-3.5 text-dynamic-indigo" />
              </div>
              {t('goal_progress')}
            </div>

            {/* Daily */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">
                  {t('today')}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">
                    {formatDuration(todayTime)}
                  </span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-muted-foreground">
                    {Math.floor(dailyGoal / 60)}h
                  </span>
                  {dailyProgress >= 100 && (
                    <Badge className="h-5 bg-dynamic-green/15 px-1.5 font-medium text-[10px] text-dynamic-green ring-1 ring-dynamic-green/30">
                      {t('complete')}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="relative">
                <Progress
                  value={dailyProgress}
                  className="h-2.5 rounded-full"
                />
                <div className="absolute inset-0 rounded-full bg-linear-to-r from-transparent via-white/10 to-transparent" />
              </div>
            </div>

            {/* Weekly */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">
                  {t('this_week')}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">
                    {formatDuration(weekTime)}
                  </span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-muted-foreground">
                    {Math.floor(weeklyGoal / 60)}h
                  </span>
                  {weeklyProgress >= 100 && (
                    <Badge className="h-5 bg-dynamic-green/15 px-1.5 font-medium text-[10px] text-dynamic-green ring-1 ring-dynamic-green/30">
                      {t('complete')}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="relative">
                <Progress
                  value={weeklyProgress}
                  className="h-2.5 rounded-full"
                />
                <div className="absolute inset-0 rounded-full bg-linear-to-r from-transparent via-white/10 to-transparent" />
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Today */}
          <div className="group/stat rounded-xl border border-dynamic-blue/20 bg-linear-to-br from-dynamic-blue/5 to-transparent p-3 transition-all hover:border-dynamic-blue/30 hover:shadow-md">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-dynamic-blue/15 ring-1 ring-dynamic-blue/25 transition-all group-hover/stat:scale-110">
                <Clock className="h-3 w-3 text-dynamic-blue" />
              </div>
              <span className="font-medium">{t('today')}</span>
            </div>
            <p className="mt-2 font-bold text-dynamic-blue text-xl">
              {todayTime > 0 ? formatDuration(todayTime) : '0m'}
            </p>
          </div>

          {/* Week */}
          <div className="group/stat rounded-xl border border-dynamic-cyan/20 bg-linear-to-br from-dynamic-cyan/5 to-transparent p-3 transition-all hover:border-dynamic-cyan/30 hover:shadow-md">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-dynamic-cyan/15 ring-1 ring-dynamic-cyan/25 transition-all group-hover/stat:scale-110">
                <Calendar className="h-3 w-3 text-dynamic-cyan" />
              </div>
              <span className="font-medium">{t('this_week')}</span>
            </div>
            <p className="mt-2 font-bold text-dynamic-cyan text-xl">
              {weekTime > 0 ? formatDuration(weekTime) : '0m'}
            </p>
          </div>

          {/* Streak */}
          <div className="group/stat rounded-xl border border-dynamic-orange/20 bg-linear-to-br from-dynamic-orange/5 to-transparent p-3 transition-all hover:border-dynamic-orange/30 hover:shadow-md">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-dynamic-orange/15 ring-1 ring-dynamic-orange/25 transition-all group-hover/stat:scale-110">
                <Flame className="h-3 w-3 text-dynamic-orange" />
              </div>
              <span className="font-medium">{t('streak')}</span>
            </div>
            <p className="mt-2 font-bold text-dynamic-orange text-xl">
              {streak} {streak === 1 ? t('day_singular') : t('days')}
            </p>
          </div>

          {/* Focus Score */}
          <div className="group/stat rounded-xl border border-dynamic-yellow/20 bg-linear-to-br from-dynamic-yellow/5 to-transparent p-3 transition-all hover:border-dynamic-yellow/30 hover:shadow-md">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-dynamic-yellow/15 ring-1 ring-dynamic-yellow/25 transition-all group-hover/stat:scale-110">
                <Zap className="h-3 w-3 text-dynamic-yellow" />
              </div>
              <span className="font-medium">{t('focus_score')}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <p className="font-bold text-dynamic-yellow text-xl">
                {productivityScore}
              </p>
              <div className="relative flex-1">
                <Progress
                  value={productivityScore}
                  className="h-2 rounded-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Today's Categories */}
        {todayData && todayData.length > 0 && (
          <div className="space-y-3 rounded-xl border border-dynamic-pink/20 bg-linear-to-br from-dynamic-pink/5 via-transparent to-transparent p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-dynamic-pink/15 ring-1 ring-dynamic-pink/25">
                  <Activity className="h-3.5 w-3.5 text-dynamic-pink" />
                </div>
                {t('today_focus')}
              </div>
              <Link href={`/${wsId}/time-tracker`}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2.5 text-muted-foreground text-xs transition-all hover:bg-dynamic-pink/10 hover:text-dynamic-pink"
                >
                  <BarChart3 className="h-3 w-3" />
                  {t('view_analytics')}
                </Button>
              </Link>
            </div>
            <div className="space-y-2">
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
                      });
                    }
                    return acc;
                  },
                  []
                )
                .sort((a, b) => b.duration - a.duration)
                .slice(0, 3)
                .map((category, index) => {
                  const percentage = (category.duration / todayTime) * 100;
                  const colorClasses = [
                    {
                      container:
                        'border-dynamic-pink/20 bg-dynamic-pink/5 hover:border-dynamic-pink/30',
                      dot: 'bg-dynamic-pink',
                      badge:
                        'bg-dynamic-pink/15 text-dynamic-pink ring-1 ring-dynamic-pink/30',
                    },
                    {
                      container:
                        'border-dynamic-purple/20 bg-dynamic-purple/5 hover:border-dynamic-purple/30',
                      dot: 'bg-dynamic-purple',
                      badge:
                        'bg-dynamic-purple/15 text-dynamic-purple ring-1 ring-dynamic-purple/30',
                    },
                    {
                      container:
                        'border-dynamic-indigo/20 bg-dynamic-indigo/5 hover:border-dynamic-indigo/30',
                      dot: 'bg-dynamic-indigo',
                      badge:
                        'bg-dynamic-indigo/15 text-dynamic-indigo ring-1 ring-dynamic-indigo/30',
                    },
                  ];
                  const colors = colorClasses[index] || colorClasses[0];
                  return (
                    <div
                      key={category.name}
                      className={cn(
                        'group/cat flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-all hover:shadow-sm',
                        colors?.container
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={cn('h-2 w-2 rounded-full', colors?.dot)}
                        />
                        <span className="font-medium">{category.name}</span>
                        <Badge
                          className={cn(
                            'h-5 px-1.5 font-medium text-[10px]',
                            colors?.badge
                          )}
                        >
                          {Math.round(percentage)}%
                        </Badge>
                      </div>
                      <span className="font-semibold">
                        {formatDuration(category.duration)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* CTA for new users */}
        {hasNoSessions && (
          <div className="flex flex-col items-center justify-between gap-2 rounded-xl border border-dynamic-purple/20 bg-linear-to-r from-dynamic-purple/5 via-transparent to-transparent p-4">
            <div className="flex flex-col items-center gap-3">
              <Sparkles className="h-5 w-5 text-dynamic-purple" />
              <div>
                <p className="font-medium text-sm">{t('no_data_title')}</p>
                <p className="text-muted-foreground text-xs">
                  {t('no_data_description')}
                </p>
              </div>
            </div>
            <Link href={`/${wsId}/time-tracker`}>
              <Button
                size="sm"
                className="gap-1.5 bg-dynamic-purple shadow-sm transition-all hover:scale-105 hover:bg-dynamic-purple/90"
              >
                <PlayCircle className="h-4 w-4" />
                {t('start_your_first_timer')}
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
