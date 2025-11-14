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
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ActivityHeatmap } from './components/activity-heatmap';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('time-tracker');

  return {
    title: t('metadata.title'),
    description: t('metadata.description'),
  };
}

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

// Optimized date calculations - cache date objects and return Today as Date
function getDateBoundaries() {
  const now = Date.now();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const dayOfWeek = today.getDay();
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - daysToSubtract);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  // Only fetch last year of data for performance
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(today.getFullYear() - 1);

  return {
    today: today.getTime(),
    todayDate: today, // Pass Date object directly to avoid reparsing
    startOfWeek: startOfWeek.getTime(),
    startOfMonth: startOfMonth.getTime(),
    oneYearAgo: oneYearAgo.getTime(),
  };
}

// Optimized streak calculation - use Date object directly, normalize comparisons once
function calculateStreak(activityDays: Set<string>, todayDate: Date): number {
  if (activityDays.size === 0) return 0;

  const oneDayMs = 24 * 60 * 60 * 1000;

  let streak = 0;
  let checkDate = new Date(todayDate); // Clone to avoid mutating input

  // Normalize today's dateString once for comparison
  const todayDateStr = checkDate.toDateString();

  // If today has activity, start counting from today
  if (activityDays.has(todayDateStr)) {
    while (activityDays.has(checkDate.toDateString())) {
      streak++;
      checkDate.setTime(checkDate.getTime() - oneDayMs);
    }
  } else {
    // If today has no activity, check yesterday and count backwards
    checkDate.setTime(checkDate.getTime() - oneDayMs);
    while (activityDays.has(checkDate.toDateString())) {
      streak++;
      checkDate.setTime(checkDate.getTime() - oneDayMs);
    }
  }

  return streak;
}

async function fetchTimeTrackingStats(userId: string, wsId: string, isPersonal: boolean) {
  const supabase = await createClient();

  const boundaries = getDateBoundaries();

  // Optimized query: only fetch last year of data with date filtering
  // If personal workspace: fetch all sessions for user
  // If not personal: only fetch sessions from this workspace
  let query = supabase
    .from('time_tracking_sessions')
    .select('start_time, duration_seconds')
    .eq('user_id', userId)
    .not('duration_seconds', 'is', null)
    .gte('start_time', new Date(boundaries.oneYearAgo).toISOString());

  // Only filter by ws_id if it's not a personal workspace
  if (!isPersonal) {
    query = query.eq('ws_id', wsId);
  }

  const { data: sessions, error } = await query.order('start_time', {
    ascending: false,
  });

  if (error) {
    console.error('Error fetching time tracking stats:', error);
    return {
      todayTime: 0,
      weekTime: 0,
      monthTime: 0,
      streak: 0,
      dailyActivity: [],
    };
  }

  if (!sessions || sessions.length === 0) {
    return {
      todayTime: 0,
      weekTime: 0,
      monthTime: 0,
      streak: 0,
      dailyActivity: [],
    };
  }

  // Pre-calculate boundaries as timestamps for faster comparison
  const todayTime = boundaries.today;
  const weekTime = boundaries.startOfWeek;
  const monthTime = boundaries.startOfMonth;

  let todayDuration = 0;
  let weekDuration = 0;
  let monthDuration = 0;
  const activityDays = new Set<string>();
  const dailyActivityMap = new Map<
    string,
    { duration: number; sessions: number }
  >();

  // Single pass through sessions - optimize Date object creation
  // Use array length caching for micro-optimization
  const sessionsLength = sessions.length;
  for (let i = 0; i < sessionsLength; i++) {
    const session = sessions[i];
    if (!session || !session.duration_seconds || !session.start_time) continue;

    // Parse timestamp once
    const startTimeMs = new Date(session.start_time).getTime();
    const duration = session.duration_seconds;

    // Fast timestamp comparisons
    if (startTimeMs >= todayTime) {
      todayDuration += duration;
    }
    if (startTimeMs >= weekTime) {
      weekDuration += duration;
    }
    if (startTimeMs >= monthTime) {
      monthDuration += duration;
    }

    // Build activity days set (local day) and daily activity map (UTC YYYY-MM-DD) in one pass
    const localDayStr = new Date(session.start_time).toDateString(); // local day for streaks
    activityDays.add(localDayStr);
    const utcDayKey = session.start_time.slice(0, 10); // "YYYY-MM-DD" from ISO UTC
    const existing = dailyActivityMap.get(utcDayKey);
    if (existing) {
      existing.duration += duration;
      existing.sessions += 1;
    } else {
      dailyActivityMap.set(utcDayKey, {
        duration,
        sessions: 1,
      });
    }
  }

  const streak = calculateStreak(activityDays, boundaries.todayDate);

  const dailyActivity = Array.from(dailyActivityMap.entries()).map(
    ([date, data]) => ({
      date,
      duration: data.duration,
      sessions: data.sessions,
    })
  );

  return {
    todayTime: todayDuration,
    weekTime: weekDuration,
    monthTime: monthDuration,
    streak,
    dailyActivity,
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
    <Card>
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
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
function HeatmapCard({
  dailyActivity,
}: {
  dailyActivity: Array<{ date: string; duration: number; sessions: number }>;
}) {
  return (
    <Card className="relative overflow-visible">
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
    <Card className="relative overflow-visible">
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

        // Fetch stats in parallel with Suspense boundaries
        const statsPromise = fetchTimeTrackingStats(user.id, wsId, isPersonal);
        return (
          <div className="grid gap-4 pb-4">
            <Suspense fallback={<StatsCardSkeleton />}>
              <StatsCardWrapper statsPromise={statsPromise} locale={locale} />
            </Suspense>

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
