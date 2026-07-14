import type { UseMutationResult } from '@tanstack/react-query';
import { ArrowUpRight, Sparkles, Target, TrendingUp } from '@tuturuuu/icons';
import type { TaskProgressMetric } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import Link from 'next/link';
import type { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

type Translate = ReturnType<typeof useTranslations>;
const today = () => new Date().toISOString().slice(0, 10);

export function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card className="group overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-muted-foreground text-sm">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-blue/10 text-dynamic-blue transition-transform group-hover:scale-110">
            {icon}
          </span>
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-bold text-3xl tracking-tight">
          {Number(value).toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricSelect({
  metrics,
  name = 'metric_id',
  selectedMetric,
}: {
  metrics: TaskProgressMetric[];
  name?: string;
  selectedMetric: TaskProgressMetric | null;
}) {
  return (
    <select
      className="h-11 w-full rounded-xl border bg-background px-3 text-sm shadow-sm outline-none transition focus:border-dynamic-blue focus:ring-2 focus:ring-dynamic-blue/15"
      defaultValue={selectedMetric?.id}
      name={name}
      required
    >
      {metrics.map((metric) => (
        <option key={metric.id} value={metric.id}>
          {metric.name}
        </option>
      ))}
    </select>
  );
}

export function ProgressPanel(props: {
  routeWsId: string;
  selectedMetric: TaskProgressMetric | null;
  stats: any;
  t: Translate;
}) {
  const { routeWsId, selectedMetric, stats, t } = props;
  const recentDays = (stats?.daily ?? []).slice(-14);
  const maxValue = Math.max(
    ...recentDays.map((day: { value: number }) => day.value),
    1
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <TrendingUp className="size-4 text-dynamic-cyan" />
              {t('progress.momentum')}
            </span>
            <Badge variant="secondary">{selectedMetric?.unit_label}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {recentDays.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('empty.automatic_activity')}
            </p>
          ) : (
            <div className="flex h-52 items-end gap-1.5">
              {recentDays.map((day: { date: string; value: number }) => (
                <div
                  className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-2"
                  key={day.date}
                  title={`${day.date}: ${day.value}`}
                >
                  <div
                    className="min-h-1 rounded-t-md bg-dynamic-cyan/70 transition group-hover:bg-dynamic-cyan"
                    style={{
                      height: `${Math.max((day.value / maxValue) * 100, 3)}%`,
                    }}
                  />
                  <span className="truncate text-center text-[10px] text-muted-foreground">
                    {day.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-dynamic-cyan/30 bg-dynamic-cyan/5">
        <CardContent className="flex h-full flex-col p-5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-dynamic-cyan/15 text-dynamic-cyan">
            <Sparkles className="size-5" />
          </div>
          <h2 className="mt-4 font-semibold text-lg">{t('autopilot.title')}</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('autopilot.description')}
          </p>
          <div className="mt-auto grid gap-2 pt-6">
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
  );
}

export function GoalsPanel(props: {
  createGoalMutation: UseMutationResult<any, unknown, FormData>;
  goals: any[];
  metrics: TaskProgressMetric[];
  selectedMetric: TaskProgressMetric | null;
  t: Translate;
}) {
  const { createGoalMutation, goals, metrics, selectedMetric, t } = props;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
      <Card className="order-2 h-fit xl:sticky xl:top-6">
        <CardHeader>
          <CardTitle>{t('goals.custom_goal')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              createGoalMutation.mutate(new FormData(event.currentTarget));
              event.currentTarget.reset();
            }}
          >
            <Input name="name" placeholder={t('fields.goal_name')} required />
            <MetricSelect metrics={metrics} selectedMetric={selectedMetric} />
            <Input
              name="target_value"
              placeholder={t('fields.target')}
              required
              type="number"
            />
            <Input defaultValue={today()} name="period_start" type="date" />
            <Input name="period_end" type="date" />
            <select
              className="h-11 rounded-xl border bg-background px-3 text-sm shadow-sm outline-none focus:border-dynamic-blue focus:ring-2 focus:ring-dynamic-blue/15"
              name="goal_type"
            >
              <option value="target">{t('goal_types.target')}</option>
              <option value="habit">{t('goal_types.habit')}</option>
            </select>
            <Button disabled={!selectedMetric || createGoalMutation.isPending}>
              <Target className="mr-2 h-4 w-4" />
              {t('actions.add_goal')}
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="order-1 grid gap-3">
        {goals.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm">
              {t('empty.goals')}
            </CardContent>
          </Card>
        ) : (
          goals.map((goal) => (
            <Card key={goal.id}>
              <CardContent className="space-y-3 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">
                      {goal.automatic ? t('goals.automatic_name') : goal.name}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {goal.period_start}
                      {goal.period_end ? ` - ${goal.period_end}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {goal.automatic ? (
                      <Badge className="gap-1" variant="secondary">
                        <Sparkles className="size-3" />
                        {t('autopilot.badge')}
                      </Badge>
                    ) : null}
                    <Badge variant="secondary">{goal.goal_type}</Badge>
                  </div>
                </div>
                {goal.automatic || goal.description ? (
                  <p className="text-muted-foreground text-sm">
                    {goal.automatic
                      ? t('goals.automatic_description')
                      : goal.description}
                  </p>
                ) : null}
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-dynamic-green"
                    style={{
                      width: `${Math.min(Number(goal.percent ?? 0), 100)}%`,
                    }}
                  />
                </div>
                <div className="text-muted-foreground text-sm">
                  {Number(goal.progress ?? 0).toLocaleString()} /{' '}
                  {Number(goal.target_value ?? 0).toLocaleString()}{' '}
                  {goal.metric?.unit_label}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

export function StatsPanel({ stats, t }: { stats: any; t: Translate }) {
  const maxValue = Math.max(
    ...(stats?.daily ?? []).map((day: any) => day.value),
    1
  );
  const trend = Number(stats?.summary.trendPercent ?? 0);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
      <Card>
        <CardHeader>
          <CardTitle>{t('stats.daily_progress')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(stats?.daily ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('empty.stats')}</p>
          ) : (
            <div className="space-y-2">
              {stats.daily.slice(-30).map((day: any) => (
                <div
                  className="grid grid-cols-[5.75rem_1fr_4rem] items-center gap-3 sm:grid-cols-[6.5rem_1fr_5rem]"
                  key={day.date}
                >
                  <div className="text-muted-foreground text-xs">
                    {day.date}
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-dynamic-blue"
                      style={{
                        width: `${(Number(day.value) / maxValue) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="text-right text-sm">
                    {Number(day.value).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <div className="grid content-start gap-3">
        <InsightCard
          label={t('stats.last_7_days')}
          value={Number(stats?.summary.last7Days ?? 0).toLocaleString()}
        />
        <InsightCard
          label={t('stats.average_active_day')}
          value={Number(stats?.summary.averagePerActiveDay ?? 0).toLocaleString(
            undefined,
            { maximumFractionDigits: 1 }
          )}
        />
        <InsightCard
          accent={trend >= 0}
          label={t('stats.weekly_trend')}
          value={`${trend > 0 ? '+' : ''}${trend.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          })}%`}
        />
      </div>
    </div>
  );
}

function InsightCard({
  accent = false,
  label,
  value,
}: {
  accent?: boolean;
  label: string;
  value: string;
}) {
  return (
    <Card
      className={accent ? 'border-dynamic-green/30 bg-dynamic-green/5' : ''}
    >
      <CardContent className="flex items-center justify-between gap-4 py-5">
        <span className="text-muted-foreground text-sm">{label}</span>
        <strong className="text-xl tabular-nums">{value}</strong>
      </CardContent>
    </Card>
  );
}
