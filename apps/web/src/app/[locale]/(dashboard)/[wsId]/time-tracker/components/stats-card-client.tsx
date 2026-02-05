'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  Clock,
  Goal,
  Star,
  TreePalm,
  TrendingUp,
  Trophy,
  Zap,
} from '@tuturuuu/icons';
import type { Workspace } from '@tuturuuu/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useTranslations } from 'next-intl';
import { getCategoryColor } from '@/components/settings/time-tracker/time-tracker-utils';
import { formatDuration } from '@/lib/time-format';
import type { DailyActivity } from '@/lib/time-tracking-helper';
import type { TimeTrackingGoal } from '../types';

dayjs.extend(utc);
dayjs.extend(timezone);

type StatsData = {
  todayTime: number;
  weekTime: number;
  monthTime: number;
  streak: number;
  dailyActivity: DailyActivity[];
};

type StatsCardClientProps = {
  wsId: string;
  userId: string;
  isPersonal: boolean;
  locale: string;
  workspace?: Workspace | null;
};

export function StatsCardClient({
  wsId,
  userId,
  isPersonal,
  locale,
  workspace,
}: StatsCardClientProps) {
  const t = useTranslations('time-tracker');
  const workspaceId = workspace?.id ?? wsId;

  // Detect client-side timezone
  const userTimezone = dayjs.tz.guess();

  // Fetch stats with proper timezone
  const { data: stats, isLoading } = useQuery({
    queryKey: [
      'time-tracker-stats',
      workspaceId,
      userId,
      userTimezone,
      'summary',
    ],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/time-tracker/stats?userId=${userId}&isPersonal=${isPersonal}&timezone=${userTimezone}&summaryOnly=true`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch time tracking stats');
      }
      return response.json() as Promise<StatsData>;
    },
    staleTime: 60 * 1000, // Increase stale time to 1 minute
  });

  // Fetch goals
  const { data: goals, isLoading: isLoadingGoals } = useQuery({
    queryKey: ['time-tracking-goals', workspaceId, userId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/time-tracking/goals?userId=${userId}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch goals');
      }
      const data = await response.json();
      return data.goals as TimeTrackingGoal[];
    },
    staleTime: 60 * 1000, // 1 minute
  });

  if (isLoading || isLoadingGoals || !stats) {
    return <StatsCardSkeleton />;
  }

  const activeGoals = goals?.filter((goal) => goal.is_active) || [];

  const formatMinutes = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const calculateProgress = (
    actualSeconds: number,
    goalMinutes: number
  ): number => {
    const actualMinutes = actualSeconds / 60;
    return Math.min((actualMinutes / goalMinutes) * 100, 100);
  };

  // Cache date formatting calculations
  const now = new Date();
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const weekdayName = now.toLocaleDateString(locale, { weekday: 'long' });

  // Calculate week range once
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dayOfWeek);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  // Calculate month range once
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-dynamic-blue/10 p-2 shadow-sm">
              <TrendingUp className="h-5 w-5 text-dynamic-blue" />
            </div>
            <div>
              <CardTitle className="text-xl">{t('stats.title')}</CardTitle>
              <CardDescription>{t('stats.description')}</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="stats" className="w-full">
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="stats" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span>{t('stats.tabs.stats')}</span>
            </TabsTrigger>
            <TabsTrigger value="goals" className="flex items-center gap-2">
              <Goal className="h-4 w-4" />
              <span>{t('stats.tabs.goals')}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Today */}
              <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
                <div className="rounded-full bg-dynamic-green/10 p-2 shadow-sm">
                  <Calendar className="h-4 w-4 text-dynamic-green" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-muted-foreground text-xs">
                      {t('stats.today.title')}
                    </p>
                    {isWeekend && <TreePalm className="h-4 w-4" />}
                  </div>
                  <p className="text-muted-foreground/80 text-xs">
                    {weekdayName}
                  </p>
                  <p className="font-bold text-lg">
                    {formatDuration(stats.todayTime)}
                  </p>
                </div>
              </div>

              {/* Week */}
              <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
                <div className="rounded-full bg-dynamic-blue/10 p-2 shadow-sm">
                  <Calendar className="h-4 w-4 text-dynamic-blue" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-muted-foreground text-xs">
                    {t('stats.week.title')}
                  </p>
                  <p className="text-muted-foreground/80 text-xs">
                    {weekStart.toLocaleDateString(locale, {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    -{' '}
                    {weekEnd.toLocaleDateString(locale, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                  <p className="font-bold text-lg">
                    {formatDuration(stats.weekTime)}
                  </p>
                </div>
              </div>

              {/* Month */}
              <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
                <div className="rounded-full bg-dynamic-purple/10 p-2 shadow-sm">
                  <Zap className="h-4 w-4 text-dynamic-purple" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-muted-foreground text-xs">
                    {t('stats.month.title')}
                  </p>
                  <p className="text-muted-foreground/80 text-xs">
                    {monthStart.toLocaleDateString(locale, {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    -{' '}
                    {monthEnd.toLocaleDateString(locale, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                  <p className="font-bold text-lg">
                    {formatDuration(stats.monthTime)}
                  </p>
                </div>
              </div>

              {/* Streak */}
              <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
                <div className="rounded-full bg-dynamic-orange/10 p-2 shadow-sm">
                  <Clock className="h-4 w-4 text-dynamic-orange" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-muted-foreground text-xs">
                      {t('stats.streak.title')}
                    </p>
                    <span className="text-sm">
                      {stats.streak >= 7 ? (
                        <Trophy className="h-3.5 w-3.5 text-dynamic-yellow" />
                      ) : (
                        <Star className="h-3.5 w-3.5 text-dynamic-yellow" />
                      )}
                    </span>
                  </div>
                  <p className="text-muted-foreground/80 text-xs">
                    {stats.streak > 0
                      ? t('stats.streak.statusActive')
                      : t('stats.streak.statusEmpty')}
                  </p>
                  <p className="font-bold text-lg">
                    {t('stats.streak.count', { count: stats.streak })}
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="goals" className="space-y-4">
            {activeGoals.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {activeGoals.map((goal) => {
                  const categoryColorClass = goal.category?.color
                    ? getCategoryColor(goal.category.color)
                    : null;
                  const dailyProgress = calculateProgress(
                    stats.todayTime,
                    goal.daily_goal_minutes
                  );
                  const weeklyProgress = goal.weekly_goal_minutes
                    ? calculateProgress(
                        stats.weekTime,
                        goal.weekly_goal_minutes
                      )
                    : null;

                  return (
                    <div
                      key={goal.id}
                      className="space-y-3 rounded-lg border p-4 shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        {goal.category ? (
                          <div
                            className={cn(
                              'h-3 w-3 rounded-full',
                              categoryColorClass || 'bg-dynamic-gray'
                            )}
                          />
                        ) : (
                          <div className="h-3 w-3 rounded-full bg-linear-to-br from-dynamic-blue to-dynamic-purple/80" />
                        )}
                        <span className="font-medium text-sm">
                          {t('goals.categoryGoalLabel', {
                            category:
                              goal.category?.name || t('goals.defaultCategory'),
                          })}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-muted-foreground text-xs">
                          <span>{t('goals.dailyProgress')}</span>
                          <span>{Math.round(dailyProgress)}%</span>
                        </div>
                        <Progress value={dailyProgress} className="h-2" />
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>{formatDuration(stats.todayTime)}</span>
                          <span>{formatMinutes(goal.daily_goal_minutes)}</span>
                        </div>
                      </div>

                      {goal.weekly_goal_minutes && (
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between text-muted-foreground text-xs">
                            <span>{t('goals.weeklyProgress')}</span>
                            <span>{Math.round(weeklyProgress || 0)}%</span>
                          </div>
                          <Progress
                            value={weeklyProgress || 0}
                            className="h-2"
                          />
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{formatDuration(stats.weekTime)}</span>
                            <span>
                              {formatMinutes(goal.weekly_goal_minutes)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Goal className="mb-2 h-10 w-10 text-muted-foreground/50" />
                <p className="text-muted-foreground text-sm">
                  {t('goals.emptyState.title')}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('goals.emptyState.subtitle')}
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function StatsCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          <div className="space-y-2">
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
