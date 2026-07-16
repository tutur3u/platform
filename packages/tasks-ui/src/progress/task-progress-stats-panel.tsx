import {
  Activity,
  BarChart3,
  CalendarDays,
  Flame,
  Tag as TagIcon,
  TrendingUp,
} from '@tuturuuu/icons';
import type {
  TaskProgressMetric,
  TaskProgressStatsResponse,
} from '@tuturuuu/tasks-api';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { BreakdownBars } from '@tuturuuu/ui/tasks/progress/breakdown-bars';
import { DailyBarChart } from '@tuturuuu/ui/tasks/progress/daily-bar-chart';
import { WeekdayDistributionChart } from '@tuturuuu/ui/tasks/progress/weekday-distribution-chart';
import {
  formatNumber,
  InsightCard,
  type Translate,
} from './task-progress-shared';

export function StatsPanel({
  selectedMetric,
  stats,
  t,
}: {
  selectedMetric: TaskProgressMetric | null;
  stats: TaskProgressStatsResponse | null;
  t: Translate;
}) {
  const summary = stats?.summary;
  const insights = stats?.insights;
  const daily = stats?.daily ?? [];
  const tags = stats?.tags ?? [];
  const unitLabel = selectedMetric?.unit_label ?? '';
  const trend = Number(summary?.trendPercent ?? 0);
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    t(`intelligence.weekdays.${i}`)
  );
  const bestDay = insights?.bestDay ?? null;

  if (daily.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          {t('empty.stats')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InsightCard
          label={t('stats.last_7_days')}
          value={formatNumber(summary?.last7Days)}
        />
        <InsightCard
          label={t('stats.average_active_day')}
          value={formatNumber(summary?.averagePerActiveDay, 1)}
        />
        <InsightCard
          accent={trend >= 0}
          label={t('stats.weekly_trend')}
          value={`${trend > 0 ? '+' : ''}${formatNumber(trend)}%`}
        />
        <InsightCard
          label={t('stats.consistency')}
          value={`${formatNumber(insights?.consistencyScore)}%`}
          sublabel={t('stats.active_days_30', {
            count: Number(insights?.activeDaysLast30 ?? 0),
          })}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="border-b bg-muted/20">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-4 text-dynamic-blue" />
              {t('stats.daily_progress')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <DailyBarChart data={daily} days={30} unitLabel={unitLabel} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b bg-muted/20">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-4 text-dynamic-green" />
              {t('stats.weekday_distribution')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <WeekdayDistributionChart
              data={insights?.weekdayTotals ?? []}
              unitLabel={unitLabel}
              weekdayLabels={weekdayLabels}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="border-b bg-muted/20">
            <CardTitle className="flex items-center gap-2">
              <TagIcon className="size-4 text-dynamic-purple" />
              {t('stats.tag_breakdown')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <BreakdownBars
              barClassName="bg-dynamic-purple"
              data={tags.map((tag) => ({ label: tag.tag, value: tag.value }))}
              emptyLabel={t('empty.tags')}
              unitLabel={unitLabel}
            />
          </CardContent>
        </Card>

        <div className="grid content-start gap-3">
          <InsightCard
            label={t('stats.best_day')}
            sublabel={bestDay?.date ?? undefined}
            value={bestDay ? formatNumber(bestDay.value) : '—'}
          />
          <InsightCard
            label={t('summary.streak')}
            sublabel={t('stats.longest_streak', {
              count: Number(summary?.longestStreak ?? 0),
            })}
            value={`${formatNumber(summary?.currentStreak)}`}
          />
          <InsightCard
            label={t('stats.projected_week')}
            value={formatNumber(insights?.projectedWeek)}
          />
          <Card className="border-dynamic-orange/30 bg-dynamic-orange/5">
            <CardContent className="flex items-center gap-3 py-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-dynamic-orange/15 text-dynamic-orange">
                {insights?.momentumStatus === 'accelerating' ? (
                  <TrendingUp className="size-4" />
                ) : insights?.momentumStatus === 'slowing' ? (
                  <Activity className="size-4" />
                ) : (
                  <Flame className="size-4" />
                )}
              </span>
              <div className="min-w-0">
                <div className="font-medium text-sm">
                  {t(
                    `intelligence.momentum.${insights?.momentumStatus ?? 'starting'}`
                  )}
                </div>
                <div className="truncate text-muted-foreground text-xs">
                  {t(
                    `intelligence.recommendations.${insights?.recommendation ?? 'start_small'}`
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
