import type { UseMutationResult } from '@tanstack/react-query';
import { Flame, Repeat, Sparkles, Target } from '@tuturuuu/icons';
import type { TaskProgressGoal, TaskProgressMetric } from '@tuturuuu/tasks-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { HabitGauge } from '@tuturuuu/ui/tasks/progress/habit-gauge';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import {
  formatNumber,
  MetricSelect,
  type Translate,
  today,
} from './task-progress-shared';

function StreakStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
      <div className="font-bold text-lg tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
    </div>
  );
}

function TargetGoalBody({ goal, t }: { goal: TaskProgressGoal; t: Translate }) {
  const percent = Math.min(Number(goal.percent ?? 0), 100);
  return (
    <>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            goal.on_track === false ? 'bg-dynamic-amber' : 'bg-dynamic-green'
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-muted-foreground text-sm">
        <span>
          {formatNumber(goal.progress)} / {formatNumber(goal.target_value)}{' '}
          {goal.metric?.unit_label}
        </span>
        <span className="tabular-nums">{formatNumber(percent)}%</span>
      </div>
      {goal.expected_progress != null || goal.projected_total != null ? (
        <div className="grid gap-2 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">
              {t('goals.expected_now')}
            </span>{' '}
            <strong>{formatNumber(goal.expected_progress, 1)}</strong>
          </div>
          <div>
            <span className="text-muted-foreground">
              {t('goals.projected_finish')}
            </span>{' '}
            <strong>{formatNumber(goal.projected_total, 1)}</strong>
          </div>
        </div>
      ) : null}
    </>
  );
}

function HabitGoalBody({ goal, t }: { goal: TaskProgressGoal; t: Translate }) {
  const threshold = Number(goal.habit_threshold ?? goal.target_value ?? 1);
  const periodValue = Number(goal.period_value ?? 0);
  const frequencyLabel = t(
    `goals.frequency.${goal.habit_frequency ?? 'per_week'}`
  );
  return (
    <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
      <HabitGauge
        caption={frequencyLabel}
        target={threshold}
        unitLabel={goal.metric?.unit_label}
        value={periodValue}
      />
      <div className="grid gap-3">
        <div className="grid grid-cols-3 gap-2">
          <StreakStat
            label={t('goals.current_streak')}
            value={Number(goal.current_streak ?? 0)}
          />
          <StreakStat
            label={t('goals.longest_streak')}
            value={Number(goal.longest_streak ?? 0)}
          />
          <StreakStat
            label={t('goals.typical_streak')}
            value={Number(goal.typical_streak ?? 0)}
          />
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Flame className="size-4 text-dynamic-orange" />
          {t('goals.percent_hit', { percent: formatNumber(goal.percent_hit) })}
        </div>
      </div>
    </div>
  );
}

function GoalCard({ goal, t }: { goal: TaskProgressGoal; t: Translate }) {
  const isHabit = goal.goal_type === 'habit';
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span
              className={cn(
                'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
                isHabit
                  ? 'bg-dynamic-orange/10 text-dynamic-orange'
                  : 'bg-dynamic-green/10 text-dynamic-green'
              )}
            >
              {isHabit ? (
                <Repeat className="size-4" />
              ) : (
                <Target className="size-4" />
              )}
            </span>
            <div>
              <div className="font-semibold">
                {goal.automatic ? t('goals.automatic_name') : goal.name}
              </div>
              <div className="text-muted-foreground text-sm">
                {goal.period_start}
                {goal.period_end ? ` – ${goal.period_end}` : ''}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {goal.automatic ? (
              <Badge className="gap-1" variant="secondary">
                <Sparkles className="size-3" />
                {t('autopilot.badge')}
              </Badge>
            ) : null}
            {typeof goal.on_track === 'boolean' ? (
              <Badge
                className={
                  goal.on_track
                    ? 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green'
                    : 'border-dynamic-amber/30 bg-dynamic-amber/10 text-dynamic-amber'
                }
                variant="outline"
              >
                {goal.on_track
                  ? t('goals.on_track')
                  : t('goals.needs_attention')}
              </Badge>
            ) : null}
            <Badge variant="secondary">
              {t(`goal_types.${goal.goal_type}`)}
            </Badge>
          </div>
        </div>
        {goal.automatic || goal.description ? (
          <p className="text-muted-foreground text-sm">
            {goal.automatic
              ? t('goals.automatic_description')
              : goal.description}
          </p>
        ) : null}
        {isHabit ? (
          <HabitGoalBody goal={goal} t={t} />
        ) : (
          <TargetGoalBody goal={goal} t={t} />
        )}
      </CardContent>
    </Card>
  );
}

export function GoalsPanel({
  createGoalMutation,
  goals,
  metrics,
  selectedMetric,
  t,
}: {
  createGoalMutation: UseMutationResult<unknown, unknown, FormData>;
  goals: TaskProgressGoal[];
  metrics: TaskProgressMetric[];
  selectedMetric: TaskProgressMetric | null;
  t: Translate;
}) {
  const [goalType, setGoalType] = useState<'target' | 'habit'>('target');

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
              setGoalType('target');
            }}
          >
            <Input name="name" placeholder={t('fields.goal_name')} required />
            <MetricSelect metrics={metrics} selectedMetric={selectedMetric} />
            <div className="grid grid-cols-2 gap-2">
              <button
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition',
                  goalType === 'target'
                    ? 'border-dynamic-green/40 bg-dynamic-green/10 text-dynamic-green'
                    : 'hover:bg-muted/50'
                )}
                onClick={() => setGoalType('target')}
                type="button"
              >
                <Target className="size-4" />
                {t('goal_types.target')}
              </button>
              <button
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition',
                  goalType === 'habit'
                    ? 'border-dynamic-orange/40 bg-dynamic-orange/10 text-dynamic-orange'
                    : 'hover:bg-muted/50'
                )}
                onClick={() => setGoalType('habit')}
                type="button"
              >
                <Repeat className="size-4" />
                {t('goal_types.habit')}
              </button>
            </div>
            <input name="goal_type" type="hidden" value={goalType} />
            {goalType === 'target' ? (
              <Input
                name="target_value"
                placeholder={t('fields.target')}
                required
                type="number"
              />
            ) : (
              <div className="grid gap-3 rounded-xl border border-dynamic-orange/20 bg-dynamic-orange/5 p-3">
                <label
                  className="text-muted-foreground text-xs"
                  htmlFor="habit_frequency"
                >
                  {t('goals.frequency_label')}
                </label>
                <select
                  className="h-11 rounded-xl border bg-background px-3 text-sm shadow-sm outline-none focus:border-dynamic-orange focus:ring-2 focus:ring-dynamic-orange/15"
                  id="habit_frequency"
                  name="habit_frequency"
                >
                  <option value="per_day">
                    {t('goals.frequency.per_day')}
                  </option>
                  <option value="per_week">
                    {t('goals.frequency.per_week')}
                  </option>
                  <option value="per_month">
                    {t('goals.frequency.per_month')}
                  </option>
                </select>
                <Input
                  min={0}
                  name="habit_threshold"
                  placeholder={t('goals.threshold_placeholder')}
                  type="number"
                />
                {/* target_value mirrors the threshold for habits; server keeps it > 0 */}
                <input name="target_value" type="hidden" value="1" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Input defaultValue={today()} name="period_start" type="date" />
              <Input name="period_end" type="date" />
            </div>
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
          goals.map((goal) => <GoalCard goal={goal} key={goal.id} t={t} />)
        )}
      </div>
    </div>
  );
}
