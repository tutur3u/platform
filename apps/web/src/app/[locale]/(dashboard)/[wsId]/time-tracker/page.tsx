import { Calendar, Clock, TrendingUp, Zap } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { formatDuration } from '@/lib/time-format';
import type { DailyActivity } from '@/lib/time-tracking-helper';
import { ActivityHeatmap } from './components/activity-heatmap';
import OverviewTimer from './components/overview-timer';
import type { SessionWithRelations } from './types';

dayjs.extend(utc);
dayjs.extend(timezone);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('time-tracker');

  return {
    title: t('metadata.title'),
    description: t('metadata.description'),
  };
}

async function fetchTimeTrackingStats(
  userId: string,
  wsId: string,
  isPersonal: boolean
) {
  const supabase = await createClient();

  // Get user's timezone
  const userTimezone = dayjs.tz.guess();

  // Call the database function to get pre-calculated stats with timezone awareness
  const { data, error } = await supabase.rpc('get_time_tracker_stats', {
    p_user_id: userId,
    p_ws_id: wsId,
    p_is_personal: isPersonal,
    p_timezone: userTimezone,
  });

  if (error) {
    console.error('Error fetching time tracking stats:', error);
    return {
      todayTime: 0,
      weekTime: 0,
      monthTime: 0,
      streak: 0,
      dailyActivity: [] as DailyActivity[],
    };
  }

  // The RPC returns an array with a single row
  const stats = data?.[0];

  if (!stats) {
    return {
      todayTime: 0,
      weekTime: 0,
      monthTime: 0,
      streak: 0,
      dailyActivity: [] as DailyActivity[],
    };
  }

  return {
    todayTime: stats.today_time || 0,
    weekTime: stats.week_time || 0,
    monthTime: stats.month_time || 0,
    streak: stats.streak || 0,
    dailyActivity: (stats.daily_activity || []) as unknown as DailyActivity[],
  };
}

async function fetchTimerData(userId: string, wsId: string) {
  const sbAdmin = await createClient();

  const [categoriesResult, runningSessionResult] = await Promise.all([
    sbAdmin.from('time_tracking_categories').select('*').eq('ws_id', wsId),
    sbAdmin
      .from('time_tracking_sessions')
      .select('*, category:time_tracking_categories(*), task:tasks(*)')
      .eq('ws_id', wsId)
      .eq('user_id', userId)
      .is('duration_seconds', null)
      .single(),
  ]);

  // Handle categories result
  let categories: typeof categoriesResult.data = [];
  if (categoriesResult.error) {
    if (categoriesResult.error.code !== 'PGRST116') {
      console.error(
        '[time-tracker] Error fetching categories:',
        categoriesResult.error.code,
        categoriesResult.error.message
      );
    }
  } else if (categoriesResult.data) {
    categories = categoriesResult.data;
  }

  // Handle running session result
  let runningSession: SessionWithRelations | null = null;
  if (runningSessionResult.error) {
    if (runningSessionResult.error.code !== 'PGRST116') {
      console.error(
        '[time-tracker] Error fetching running session:',
        runningSessionResult.error.code,
        runningSessionResult.error.message
      );
    }
  } else if (runningSessionResult.data) {
    runningSession = runningSessionResult.data as SessionWithRelations;
  }

  return {
    categories,
    runningSession,
  };
}

// Stats card component with cached date formatting
async function StatsCard({
  stats,
  locale,
}: {
  stats: Awaited<ReturnType<typeof fetchTimeTrackingStats>>;
  locale: string;
}) {
  // Cache date formatting calculations
  const now = new Date();
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const weekdayName = now.toLocaleDateString(locale, { weekday: 'long' });

  // Calculate week range once
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - daysToSubtract);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const weekRange = `${startOfWeek.toLocaleDateString(locale, { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}`;

  const monthName = now.toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });

  const t = await getTranslations('time-tracker');

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-dynamic-blue to-dynamic-purple shadow-lg">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle className="text-lg sm:text-xl">
              {t('stats.title')}
            </CardTitle>
            <CardDescription>{t('stats.description')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 items-center">
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Today */}
          <div className="rounded-lg border border-dynamic-blue/30 bg-background p-3 transition-all duration-300 hover:shadow-md">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-dynamic-blue/10 p-2 shadow-sm">
                <Calendar className="h-4 w-4 text-dynamic-blue" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-muted-foreground text-xs">
                    {t('stats.today.title')}
                  </p>
                  <span className="text-sm">{isWeekend ? '🏖️' : '💼'}</span>
                </div>
                <p className="text-muted-foreground/80 text-xs">
                  {weekdayName}
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
                <TrendingUp className="h-4 w-4 text-dynamic-green" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-muted-foreground text-xs">
                    {t('stats.week.title')}
                  </p>
                  <span className="text-sm">📊</span>
                </div>
                <p className="text-muted-foreground/80 text-xs">{weekRange}</p>
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
                <Zap className="h-4 w-4 text-dynamic-purple" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-muted-foreground text-xs">
                    {t('stats.month.title')}
                  </p>
                  <span className="text-sm">🚀</span>
                </div>
                <p className="text-muted-foreground/80 text-xs">{monthName}</p>
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
                <Clock className="h-4 w-4 text-dynamic-orange" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-muted-foreground text-xs">
                    {t('stats.streak.title')}
                  </p>
                  <span className="text-sm">
                    {stats.streak >= 7 ? '🏆' : '⭐'}
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
        </div>
      </CardContent>
    </Card>
  );
}

// Loading skeleton for stats
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

// Heatmap card with loading state
function HeatmapCard({ dailyActivity }: { dailyActivity: DailyActivity[] }) {
  return (
    <Card className="relative overflow-x-auto">
      <CardContent className="pt-6">
        <div className="relative overflow-visible">
          <ActivityHeatmap dailyActivity={dailyActivity} />
        </div>
      </CardContent>
    </Card>
  );
}

function HeatmapCardSkeleton() {
  return (
    <Card className="relative overflow-x-auto">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          <div className="space-y-2">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-56 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </CardContent>
    </Card>
  );
}

function TimerCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="h-6 w-32 animate-pulse rounded bg-muted" />
          <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-10 animate-pulse rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-10 flex-1 animate-pulse rounded bg-muted" />
          <div className="h-10 w-32 animate-pulse rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}

export default async function TimeTrackerPage({
  params,
}: {
  params: Promise<{ locale: string; wsId: string }>;
}) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, locale, isPersonal }) => {
        const user = await getCurrentSupabaseUser();
        if (!user) return notFound();

        // Fetch stats and timer data in parallel
        const [statsPromise, timerDataPromise] = [
          fetchTimeTrackingStats(user.id, wsId, isPersonal),
          fetchTimerData(user.id, wsId),
        ];

        return (
          <div className="grid gap-4 pb-4">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Suspense fallback={<StatsCardSkeleton />}>
                <StatsCardWrapper statsPromise={statsPromise} locale={locale} />
              </Suspense>
              {/* Quick Timer */}
              <Suspense fallback={<TimerCardSkeleton />}>
                <TimerCardWrapper
                  timerDataPromise={timerDataPromise}
                  wsId={wsId}
                />
              </Suspense>
            </div>

            {/* Heatmap */}
            <Suspense fallback={<HeatmapCardSkeleton />}>
              <HeatmapCardWrapper statsPromise={statsPromise} />
            </Suspense>
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}

// Separate async components for Suspense boundaries
async function StatsCardWrapper({
  statsPromise,
  locale,
}: {
  statsPromise: Promise<Awaited<ReturnType<typeof fetchTimeTrackingStats>>>;
  locale: string;
}) {
  const stats = await statsPromise;
  return <StatsCard stats={stats} locale={locale} />;
}

async function HeatmapCardWrapper({
  statsPromise,
}: {
  statsPromise: Promise<Awaited<ReturnType<typeof fetchTimeTrackingStats>>>;
}) {
  const stats = await statsPromise;
  // if (!stats.dailyActivity || stats.dailyActivity.length === 0) {
  //   return null;
  // }
  return <HeatmapCard dailyActivity={stats.dailyActivity} />;
}

async function TimerCardWrapper({
  timerDataPromise,
  wsId,
}: {
  timerDataPromise: Promise<Awaited<ReturnType<typeof fetchTimerData>>>;
  wsId: string;
}) {
  const timerData = await timerDataPromise;
  return (
    <OverviewTimer
      wsId={wsId}
      categories={timerData.categories}
      initialRunningSession={timerData.runningSession}
    />
  );
}
