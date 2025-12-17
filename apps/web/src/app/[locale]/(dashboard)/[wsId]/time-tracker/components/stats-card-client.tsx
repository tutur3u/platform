'use client';

import { useQuery } from '@tanstack/react-query';
import { Calendar, Clock, TrendingUp, Zap } from '@tuturuuu/icons';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useTranslations } from 'next-intl';
import { formatDuration } from '@/lib/time-format';
import type { DailyActivity } from '@/lib/time-tracking-helper';

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
};

export function StatsCardClient({
  wsId,
  userId,
  isPersonal,
  locale,
}: StatsCardClientProps) {
  const t = useTranslations('time-tracker');

  // Detect client-side timezone
  const userTimezone = dayjs.tz.guess();

  // Fetch stats with proper timezone
  const { data: stats, isLoading } = useQuery({
    queryKey: ['time-tracker-stats', wsId, userId, userTimezone],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracker/stats?userId=${userId}&isPersonal=${isPersonal}&timezone=${userTimezone}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch time tracking stats');
      }
      return response.json() as Promise<StatsData>;
    },
    staleTime: 30 * 1000, // 30 seconds
  });

  if (isLoading || !stats) {
    return <StatsCardSkeleton />;
  }

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
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-dynamic-blue/10 p-2 shadow-sm">
            <TrendingUp className="h-5 w-5 text-dynamic-blue" />
          </div>
          <div>
            <CardTitle className="text-xl">{t('stats.title')}</CardTitle>
            <CardDescription>{t('stats.description')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
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
                {isWeekend && <span className="text-sm">🏖️</span>}
              </div>
              <p className="text-muted-foreground/80 text-xs">
                {weekdayName}
              </p>
              <p className="font-bold text-lg">{formatDuration(stats.todayTime)}</p>
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
              <p className="font-bold text-lg">{formatDuration(stats.weekTime)}</p>
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
