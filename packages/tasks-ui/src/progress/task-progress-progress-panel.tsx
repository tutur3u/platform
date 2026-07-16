import {
  ArrowUpRight,
  CalendarDays,
  Sparkles,
  TrendingUp,
} from '@tuturuuu/icons';
import type {
  TaskProgressMetric,
  TaskProgressStatsResponse,
} from '@tuturuuu/tasks-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { ActivityHeatmap } from '@tuturuuu/ui/tasks/progress/activity-heatmap';
import { CumulativeProgressChart } from '@tuturuuu/ui/tasks/progress/cumulative-progress-chart';
import Link from 'next/link';
import type { Translate } from './task-progress-shared';

export function ProgressPanel({
  onQuickLog,
  routeWsId,
  selectedMetric,
  stats,
  t,
}: {
  onQuickLog?: () => void;
  routeWsId: string;
  selectedMetric: TaskProgressMetric | null;
  stats: TaskProgressStatsResponse | null;
  t: Translate;
}) {
  const daily = stats?.daily ?? [];
  const heatmap = stats?.heatmap ?? [];
  const unitLabel = selectedMetric?.unit_label ?? '';

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20">
            <CardTitle className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <TrendingUp className="size-4 text-dynamic-cyan" />
                {t('progress.momentum')}
              </span>
              {selectedMetric ? (
                <Badge variant="secondary">{selectedMetric.unit_label}</Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {daily.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t('empty.automatic_activity')}
              </p>
            ) : (
              <CumulativeProgressChart
                daily={daily}
                height={260}
                unitLabel={unitLabel}
              />
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-dynamic-cyan/30 bg-dynamic-cyan/5">
          <CardContent className="flex h-full flex-col p-5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-dynamic-cyan/15 text-dynamic-cyan">
              <Sparkles className="size-5" />
            </div>
            <h2 className="mt-4 font-semibold text-lg">
              {t('autopilot.title')}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('autopilot.description')}
            </p>
            <div className="mt-auto grid gap-2 pt-6">
              {onQuickLog ? (
                <Button onClick={onQuickLog} type="button">
                  <Sparkles className="mr-2 size-4" />
                  {t('quicklog.open')}
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <Link href={`/${routeWsId}/goals`}>
                  {t('autopilot.review_goal')}
                  <ArrowUpRight className="ml-auto size-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href={`/${routeWsId}/analytics`}>
                  {t('autopilot.open_analytics')}
                  <ArrowUpRight className="ml-auto size-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-dynamic-green" />
            {t('progress.activity_calendar')}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {heatmap.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('empty.automatic_activity')}
            </p>
          ) : (
            <ActivityHeatmap data={heatmap} unitLabel={unitLabel} weeks={53} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
