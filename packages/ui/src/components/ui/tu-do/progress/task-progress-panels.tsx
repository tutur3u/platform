import type { UseMutationResult } from '@tanstack/react-query';
import { Plus, Target } from '@tuturuuu/icons';
import type { TaskProgressMetric } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-muted-foreground text-sm">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-bold text-2xl">
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
      className="h-10 rounded-md border bg-background px-3 text-sm"
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
  createEntryMutation: UseMutationResult<any, unknown, FormData>;
  createMetricMutation: UseMutationResult<any, unknown, FormData>;
  entries: any[];
  metrics: TaskProgressMetric[];
  selectedMetric: TaskProgressMetric | null;
  t: Translate;
}) {
  const {
    createEntryMutation,
    createMetricMutation,
    entries,
    metrics,
    selectedMetric,
    t,
  } = props;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>{t('progress.log_entry')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              createEntryMutation.mutate(new FormData(event.currentTarget));
              event.currentTarget.reset();
            }}
          >
            <MetricSelect metrics={metrics} selectedMetric={selectedMetric} />
            <Input defaultValue={today()} name="entry_date" type="date" />
            <Input
              name="value"
              placeholder={t('fields.value')}
              required
              type="number"
            />
            <Input name="tags" placeholder={t('fields.tags')} />
            <Textarea name="note" placeholder={t('fields.note')} />
            <Button disabled={!selectedMetric || createEntryMutation.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              {t('actions.add_entry')}
            </Button>
          </form>
          <form
            className="mt-6 grid gap-3 border-t pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              createMetricMutation.mutate(new FormData(event.currentTarget));
              event.currentTarget.reset();
            }}
          >
            <Input name="name" placeholder={t('fields.metric_name')} required />
            <Input name="unit_label" placeholder={t('fields.unit')} required />
            <Button disabled={createMetricMutation.isPending} variant="outline">
              {t('actions.add_metric')}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('progress.recent_entries')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {entries.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('empty.entries')}
            </p>
          ) : (
            entries.map((entry) => (
              <div
                className="flex items-start justify-between gap-3 rounded-md border p-3"
                key={entry.id}
              >
                <div>
                  <div className="font-medium">{entry.entry_date}</div>
                  <div className="text-muted-foreground text-sm">
                    {entry.note || entry.metric?.name}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(entry.tags ?? []).map((tag: string) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="text-right font-semibold">
                  {Number(entry.value).toLocaleString()}{' '}
                  {entry.metric?.unit_label}
                </div>
              </div>
            ))
          )}
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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>{t('goals.create_goal')}</CardTitle>
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
              className="h-10 rounded-md border bg-background px-3 text-sm"
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
      <div className="grid gap-3">
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
                    <div className="font-semibold">{goal.name}</div>
                    <div className="text-muted-foreground text-sm">
                      {goal.period_start}
                      {goal.period_end ? ` - ${goal.period_end}` : ''}
                    </div>
                  </div>
                  <Badge variant="secondary">{goal.goal_type}</Badge>
                </div>
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

  return (
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
                className="grid grid-cols-[6.5rem_1fr_5rem] items-center gap-3"
                key={day.date}
              >
                <div className="text-muted-foreground text-xs">{day.date}</div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-dynamic-blue"
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
  );
}
