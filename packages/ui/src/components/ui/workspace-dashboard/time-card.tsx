'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Pause, Square, Timer } from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { DashboardCard } from './dashboard-card';
import {
  DashboardCardError,
  DashboardRowsSkeleton,
} from './dashboard-card-states';
import { secondsSince, splitDuration } from './dashboard-model';
import {
  dashboardRunningTimerQuery,
  dashboardTimeStatsQuery,
} from './dashboard-queries';
import { TimeGoal, TimeWeekBars } from './time-goal-week';
import { useNow } from './use-now';
import { useTimerActions } from './use-timer-actions';

interface TimeCardProps {
  wsId: string;
  /** Track app destination for the header link and goal setup. */
  trackHref: string;
}

/** The viewer's running timer with pause/stop, daily goal and last 7 days. */
export function TimeCard({ wsId, trackHref }: TimeCardProps) {
  const t = useTranslations('dashboard.overview');
  const now = useNow(30_000);
  const running = useQuery(dashboardRunningTimerQuery(wsId));
  const stats = useQuery(dashboardTimeStatsQuery(wsId));
  const timer = useTimerActions(wsId);
  const duration = (seconds: number) => t('duration', splitDuration(seconds));

  const failed = running.status === 'error' || stats.status === 'error';
  const pending = running.status === 'pending' || stats.status === 'pending';
  const session = running.data ?? null;

  return (
    <DashboardCard
      id="time"
      title={t('time_title')}
      actions={
        <a
          href={trackHref}
          className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-md px-1 text-muted-foreground text-xs hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t('track')}
          <ChevronRight aria-hidden className="size-3.5" />
        </a>
      }
    >
      {failed ? (
        <DashboardCardError
          message={t('time_error')}
          retryLabel={t('retry')}
          retrying={running.isFetching || stats.isFetching}
          onRetry={() => {
            void running.refetch();
            void stats.refetch();
          }}
        />
      ) : pending ? (
        <DashboardRowsSkeleton rows={2} label={t('loading')} />
      ) : (
        <div className="grid min-w-0 gap-3">
          {session ? (
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-dynamic-green/45 px-2 py-1 font-medium text-dynamic-green text-xs tabular-nums">
                <Timer aria-hidden className="size-3.5" />
                <span className="sr-only">{t('timer_running')}</span>
                {duration(secondsSince(session.start_time, now))}
              </span>
              <span
                className="min-w-0 flex-[1_1_8rem] truncate text-sm"
                title={session.title ?? undefined}
              >
                {session.title || t('untitled_session')}
              </span>
              <span className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={timer.isPending}
                  onClick={() => timer.mutate({ action: 'pause', sessionId: session.id })}
                >
                  <Pause aria-hidden />
                  {t('timer_pause')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={timer.isPending}
                  onClick={() => timer.mutate({ action: 'stop', sessionId: session.id })}
                >
                  <Square aria-hidden />
                  {t('timer_stop')}
                </Button>
              </span>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t('no_timer')}</p>
          )}
          <TimeGoal
            wsId={wsId}
            todaySeconds={stats.data?.todayTime ?? 0}
            trackHref={trackHref}
          />
          <dl className="grid min-w-0 grid-cols-2 gap-3">
            <div className="min-w-0">
              <dt className="text-muted-foreground text-xs">{t('tracked_today')}</dt>
              <dd className="font-semibold text-xl tabular-nums">
                {duration(stats.data?.todayTime ?? 0)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground text-xs">{t('tracked_week')}</dt>
              <dd className="font-semibold text-xl tabular-nums">
                {duration(stats.data?.weekTime ?? 0)}
              </dd>
            </div>
          </dl>
          <TimeWeekBars wsId={wsId} now={now} />
        </div>
      )}
    </DashboardCard>
  );
}
