import {
  ActivitySquare,
  Brain,
  Lightbulb,
  RefreshCw,
  Sparkles,
} from '@tuturuuu/icons';
import type {
  TaskProgressCatchup,
  TaskProgressCatchupPeriod,
  TaskProgressStatsResponse,
} from '@tuturuuu/tasks-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import type { useTranslations } from 'next-intl';

type Translate = ReturnType<typeof useTranslations>;

function formatValue(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function CatchupList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2 text-sm">
      {items.map((item, index) => (
        <li className="flex gap-2" key={`${index}-${item}`}>
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-dynamic-cyan" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function TaskProgressIntelligencePanel({
  aiEnabled,
  cadence,
  catchup,
  catchupError,
  catchupLoading,
  onPeriodChange,
  onRefresh,
  period,
  refreshing,
  showDecisions,
  stats,
  t,
}: {
  aiEnabled: boolean;
  cadence: string;
  catchup?: TaskProgressCatchup;
  catchupError: boolean;
  catchupLoading: boolean;
  onPeriodChange: (period: TaskProgressCatchupPeriod) => void;
  onRefresh: () => void;
  period: TaskProgressCatchupPeriod;
  refreshing: boolean;
  showDecisions: boolean;
  stats: TaskProgressStatsResponse | null;
  t: Translate;
}) {
  const strongestWeekday = stats?.insights.strongestWeekday;
  const weekday = strongestWeekday
    ? t(`intelligence.weekdays.${strongestWeekday.weekday}`)
    : t('intelligence.not_enough_data');

  return (
    <section
      className={
        showDecisions
          ? 'grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]'
          : undefined
      }
    >
      {showDecisions ? (
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20">
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="size-4 text-dynamic-amber" />
              {t('intelligence.title')}
              <Badge className="ml-auto" variant="secondary">
                {t(
                  `intelligence.momentum.${stats?.insights.momentumStatus ?? 'starting'}`
                )}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 pt-5 sm:grid-cols-3">
            <div className="rounded-xl border bg-background p-4">
              <div className="text-muted-foreground text-xs">
                {t('intelligence.week_forecast')}
              </div>
              <div className="mt-2 font-semibold text-2xl tabular-nums">
                {formatValue(stats?.insights.projectedWeek ?? 0)}
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                {t('intelligence.forecast_context', {
                  value: formatValue(stats?.periods.thisWeek ?? 0),
                })}
              </p>
            </div>
            <div className="rounded-xl border bg-background p-4">
              <div className="text-muted-foreground text-xs">
                {t('intelligence.consistency')}
              </div>
              <div className="mt-2 font-semibold text-2xl tabular-nums">
                {stats?.insights.consistencyScore ?? 0}%
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                {t('intelligence.active_days', {
                  value: stats?.insights.activeDaysLast30 ?? 0,
                })}
              </p>
            </div>
            <div className="rounded-xl border bg-background p-4">
              <div className="text-muted-foreground text-xs">
                {t('intelligence.strongest_day')}
              </div>
              <div className="mt-2 font-semibold text-lg">{weekday}</div>
              <p className="mt-1 text-muted-foreground text-xs">
                {t(
                  `intelligence.recommendations.${stats?.insights.recommendation ?? 'start_small'}`
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden border-dynamic-cyan/30 bg-dynamic-cyan/5">
        <CardHeader className="border-dynamic-cyan/20 border-b">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Brain className="size-4 text-dynamic-cyan" />
            {t('intelligence.catchup.title')}
            <Badge className="gap-1" variant="secondary">
              <Sparkles className="size-3" />
              {aiEnabled
                ? t('intelligence.catchup.enabled')
                : t('intelligence.catchup.opt_in')}
            </Badge>
            {aiEnabled ? (
              <div className="ml-auto flex gap-1">
                {cadence === 'both' ? (
                  <>
                    <Button
                      onClick={() => onPeriodChange('weekly')}
                      size="sm"
                      variant={period === 'weekly' ? 'secondary' : 'ghost'}
                    >
                      {t('intelligence.catchup.weekly')}
                    </Button>
                    <Button
                      onClick={() => onPeriodChange('monthly')}
                      size="sm"
                      variant={period === 'monthly' ? 'secondary' : 'ghost'}
                    >
                      {t('intelligence.catchup.monthly')}
                    </Button>
                  </>
                ) : null}
                <Button
                  aria-label={t('intelligence.catchup.refresh')}
                  disabled={refreshing || catchupLoading}
                  onClick={onRefresh}
                  size="icon"
                  variant="ghost"
                >
                  <RefreshCw className={refreshing ? 'animate-spin' : ''} />
                </Button>
              </div>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          {!aiEnabled ? (
            <div className="flex gap-3 text-sm">
              <ActivitySquare className="mt-0.5 size-5 shrink-0 text-dynamic-cyan" />
              <div>
                <p className="font-medium">
                  {t('intelligence.catchup.disabled_title')}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {t('intelligence.catchup.disabled_description')}
                </p>
              </div>
            </div>
          ) : catchupLoading ? (
            <p className="text-muted-foreground text-sm">
              {t('intelligence.catchup.loading')}
            </p>
          ) : catchupError || !catchup ? (
            <p className="text-muted-foreground text-sm">
              {t('intelligence.catchup.error')}
            </p>
          ) : (
            <div className="space-y-5">
              <p className="text-sm leading-relaxed">
                {catchup.executiveSummary}
              </p>
              {catchup.highlights.length ? (
                <div>
                  <h4 className="mb-2 font-medium text-xs uppercase tracking-wide">
                    {t('intelligence.catchup.highlights')}
                  </h4>
                  <CatchupList items={catchup.highlights} />
                </div>
              ) : null}
              {catchup.watchouts.length ? (
                <div>
                  <h4 className="mb-2 font-medium text-xs uppercase tracking-wide">
                    {t('intelligence.catchup.watchouts')}
                  </h4>
                  <CatchupList items={catchup.watchouts} />
                </div>
              ) : null}
              {catchup.nextActions.length ? (
                <div>
                  <h4 className="mb-2 font-medium text-xs uppercase tracking-wide">
                    {t('intelligence.catchup.next_actions')}
                  </h4>
                  <CatchupList items={catchup.nextActions} />
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
