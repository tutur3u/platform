'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Flag, Sparkles, Target, Trophy } from '@tuturuuu/icons';
import {
  createTaskLeaderboard,
  createTaskLeaderboardTeam,
  createTaskProgressGoal,
  getTaskProgressStats,
  importTaskProgressEntries,
  isTaskProgressSchemaUnavailable,
  listTaskLeaderboards,
  listTaskProgressGoals,
  listTaskProgressMetrics,
  type TaskProgressMetric,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ImportPanel } from './task-progress-import-panel';
import { LeaderboardsPanel } from './task-progress-leaderboards-panel';
import {
  GoalsPanel,
  ProgressPanel,
  StatsPanel,
  SummaryCard,
} from './task-progress-panels';

export type TaskProgressView =
  | 'progress'
  | 'goals'
  | 'stats'
  | 'leaderboards'
  | 'import';

interface TaskProgressPageProps {
  routeWsId: string;
  view: TaskProgressView;
  wsId: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const AUTOMATIC_METRIC_KINDS = new Set([
  'focus_sessions',
  'minutes',
  'points',
  'tasks',
]);

function metricOption(metrics: TaskProgressMetric[]) {
  return metrics.find((metric) => metric.is_default) ?? metrics[0] ?? null;
}

function parseImportRows(text: string, metrics: TaskProgressMetric[]) {
  const metricByName = new Map(
    metrics.map((metric) => [metric.name.trim().toLowerCase(), metric])
  );
  const fallbackMetric = metricOption(metrics);

  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [entry_date, rawValue, metricName, rawTags, note] = line
        .split(',')
        .map((part) => part.trim());
      const metric =
        (metricName ? metricByName.get(metricName.toLowerCase()) : null) ??
        fallbackMetric;

      if (!metric) throw new Error('missing_metric');

      return {
        entry_date: entry_date || today(),
        metric_id: metric.id,
        value: Number(rawValue || 0),
        tags: rawTags
          ? rawTags
              .split('|')
              .map((tag) => tag.trim())
              .filter(Boolean)
          : [],
        note: note || null,
      };
    });
}

export function TaskProgressPage({
  routeWsId,
  view,
  wsId,
}: TaskProgressPageProps) {
  const t = useTranslations('task-progress');
  const queryClient = useQueryClient();
  const [importText, setImportText] = useState('');
  const [importPreviewCount, setImportPreviewCount] = useState(0);
  const [selectedMetricId, setSelectedMetricId] = useState<string | null>(null);
  const queryRoot = ['task-progress', wsId];

  const metricsQuery = useQuery({
    queryKey: [...queryRoot, 'metrics'],
    queryFn: () => listTaskProgressMetrics(wsId),
  });
  const metrics =
    metricsQuery.data?.ok === true ? metricsQuery.data.metrics : [];
  const automaticMetrics = useMemo(
    () =>
      metrics.filter((metric) => AUTOMATIC_METRIC_KINDS.has(metric.unit_kind)),
    [metrics]
  );
  const primaryMetrics =
    automaticMetrics.length > 0 ? automaticMetrics : metrics;
  const selectedMetric = useMemo(
    () =>
      primaryMetrics.find((metric) => metric.id === selectedMetricId) ??
      metricOption(primaryMetrics),
    [primaryMetrics, selectedMetricId]
  );

  const goalsQuery = useQuery({
    queryKey: [...queryRoot, 'goals'],
    queryFn: () => listTaskProgressGoals(wsId, { status: 'active' }),
  });
  const statsQuery = useQuery({
    queryKey: [...queryRoot, 'stats', selectedMetric?.id],
    queryFn: () =>
      getTaskProgressStats(wsId, { metric_id: selectedMetric?.id }),
    enabled: metrics.length > 0,
  });
  const leaderboardsQuery = useQuery({
    queryKey: [...queryRoot, 'leaderboards'],
    queryFn: () => listTaskLeaderboards(wsId, { status: 'active' }),
  });

  const invalidateProgress = () =>
    queryClient.invalidateQueries({ queryKey: queryRoot });

  const createGoalMutation = useMutation({
    mutationFn: (formData: FormData) =>
      createTaskProgressGoal(wsId, {
        metric_id: String(formData.get('metric_id') ?? ''),
        name: String(formData.get('name') ?? ''),
        target_value: Number(formData.get('target_value') ?? 0),
        period_start: String(formData.get('period_start') ?? today()),
        period_end: String(formData.get('period_end') || '') || null,
        goal_type:
          String(formData.get('goal_type')) === 'habit' ? 'habit' : 'target',
      }),
    onSuccess: () => {
      toast.success(t('toast.goal_created'));
      invalidateProgress();
    },
  });
  const createLeaderboardMutation = useMutation({
    mutationFn: (formData: FormData) =>
      createTaskLeaderboard(wsId, {
        metric_id: String(formData.get('metric_id') ?? ''),
        name: String(formData.get('name') ?? ''),
        period_start: String(formData.get('period_start') ?? today()),
        period_end: String(formData.get('period_end') || '') || null,
      }),
    onSuccess: () => {
      toast.success(t('toast.leaderboard_created'));
      invalidateProgress();
    },
  });
  const createTeamMutation = useMutation({
    mutationFn: ({
      formData,
      leaderboardId,
    }: {
      formData: FormData;
      leaderboardId: string;
    }) =>
      createTaskLeaderboardTeam(wsId, leaderboardId, {
        name: String(formData.get('name') ?? ''),
        color: String(formData.get('color') || '') || null,
      }),
    onSuccess: () => {
      toast.success(t('toast.team_created'));
      invalidateProgress();
    },
  });
  const importMutation = useMutation({
    mutationFn: (commit: boolean) =>
      importTaskProgressEntries(wsId, {
        commit,
        entries: parseImportRows(importText, metrics),
      }),
    onSuccess: (response) => {
      if (response.ok) {
        setImportPreviewCount(response.summary.entriesCount);
        toast.success(
          response.committed
            ? t('toast.import_committed')
            : t('toast.import_previewed')
        );
      }
      invalidateProgress();
    },
    onError: () => toast.error(t('toast.import_failed')),
  });

  const hasPendingSchema =
    isTaskProgressSchemaUnavailable(metricsQuery.data) ||
    isTaskProgressSchemaUnavailable(statsQuery.data);
  const goals = goalsQuery.data?.ok ? goalsQuery.data.goals : [];
  const stats = statsQuery.data?.ok ? statsQuery.data : null;
  const leaderboards = leaderboardsQuery.data?.ok
    ? leaderboardsQuery.data.leaderboards
    : [];
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 md:p-6 lg:p-8">
      <section className="overflow-hidden rounded-2xl border bg-card/60 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div className="max-w-2xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge className="gap-1.5" variant="secondary">
                <Sparkles className="size-3.5 text-dynamic-cyan" />
                {t('autopilot.badge')}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {t('autopilot.live')}
              </span>
            </div>
            <h1 className="font-bold text-2xl tracking-tight md:text-3xl">
              {t(`views.${view}.title`)}
            </h1>
            <p className="mt-1 text-muted-foreground text-sm md:text-base">
              {t(`views.${view}.description`)}
            </p>
          </div>
          <div className="shrink-0">
            {primaryMetrics.length > 0 ? (
              <label className="flex min-w-56 items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2 text-sm shadow-sm">
                <span className="text-muted-foreground">
                  {t('fields.automatic_metric')}
                </span>
                <select
                  className="min-w-28 bg-transparent text-right font-medium outline-none"
                  onChange={(event) => setSelectedMetricId(event.target.value)}
                  value={selectedMetric?.id ?? ''}
                >
                  {primaryMetrics.map((metric) => (
                    <option key={metric.id} value={metric.id}>
                      {metric.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>
      </section>

      {hasPendingSchema ? (
        <Card>
          <CardContent className="py-8 text-sm">
            {t('schema_unavailable')}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<BarChart3 className="h-4 w-4" />}
          label={t('summary.total')}
          value={stats?.summary.total ?? 0}
        />
        <SummaryCard
          icon={<Flag className="h-4 w-4" />}
          label={t('summary.today')}
          value={stats?.summary.today ?? 0}
        />
        <SummaryCard
          icon={<Target className="h-4 w-4" />}
          label={t('summary.goals')}
          value={goals.length}
        />
        <SummaryCard
          icon={<Trophy className="h-4 w-4" />}
          label={t('summary.streak')}
          value={stats?.summary.currentStreak ?? 0}
        />
      </div>

      {view === 'progress' ? (
        <ProgressPanel
          routeWsId={routeWsId}
          selectedMetric={selectedMetric}
          stats={stats}
          t={t}
        />
      ) : null}
      {view === 'goals' ? (
        <GoalsPanel
          createGoalMutation={createGoalMutation}
          goals={goals}
          metrics={metrics}
          selectedMetric={selectedMetric}
          t={t}
        />
      ) : null}
      {view === 'stats' ? <StatsPanel stats={stats} t={t} /> : null}
      {view === 'leaderboards' ? (
        <LeaderboardsPanel
          createLeaderboardMutation={createLeaderboardMutation}
          createTeamMutation={createTeamMutation}
          leaderboards={leaderboards}
          metrics={metrics}
          selectedMetric={selectedMetric}
          t={t}
        />
      ) : null}
      {view === 'import' ? (
        <ImportPanel
          importMutation={importMutation}
          importPreviewCount={importPreviewCount}
          importText={importText}
          setImportText={setImportText}
          t={t}
        />
      ) : null}
    </div>
  );
}
