'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Flag, Target, TrendingUp, Trophy } from '@tuturuuu/icons';
import {
  createTaskLeaderboard,
  createTaskLeaderboardTeam,
  createTaskProgressEntry,
  createTaskProgressGoal,
  createTaskProgressMetric,
  getTaskProgressStats,
  importTaskProgressEntries,
  isTaskProgressSchemaUnavailable,
  listTaskLeaderboards,
  listTaskProgressEntries,
  listTaskProgressGoals,
  listTaskProgressMetrics,
  type TaskProgressMetric,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/sonner';
import Link from 'next/link';
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
  onViewChange?: (view: TaskProgressView) => void;
  routeWsId: string;
  view: TaskProgressView;
  wsId: string;
}

const today = () => new Date().toISOString().slice(0, 10);

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
  onViewChange,
  routeWsId,
  view,
  wsId,
}: TaskProgressPageProps) {
  const t = useTranslations('task-progress');
  const queryClient = useQueryClient();
  const [importText, setImportText] = useState('');
  const [importPreviewCount, setImportPreviewCount] = useState(0);
  const queryRoot = ['task-progress', wsId];

  const metricsQuery = useQuery({
    queryKey: [...queryRoot, 'metrics'],
    queryFn: () => listTaskProgressMetrics(wsId),
  });
  const metrics =
    metricsQuery.data?.ok === true ? metricsQuery.data.metrics : [];
  const selectedMetric = useMemo(() => metricOption(metrics), [metrics]);

  const entriesQuery = useQuery({
    queryKey: [...queryRoot, 'entries', selectedMetric?.id],
    queryFn: () =>
      listTaskProgressEntries(wsId, {
        metric_id: selectedMetric?.id,
        pageSize: 25,
      }),
    enabled: metrics.length > 0,
  });
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

  const createMetricMutation = useMutation({
    mutationFn: (formData: FormData) =>
      createTaskProgressMetric(wsId, {
        name: String(formData.get('name') ?? ''),
        unit_label: String(formData.get('unit_label') ?? ''),
        unit_kind: 'custom',
      }),
    onSuccess: () => {
      toast.success(t('toast.metric_created'));
      invalidateProgress();
    },
  });
  const createEntryMutation = useMutation({
    mutationFn: (formData: FormData) =>
      createTaskProgressEntry(wsId, {
        metric_id: String(formData.get('metric_id') ?? ''),
        entry_date: String(formData.get('entry_date') ?? today()),
        value: Number(formData.get('value') ?? 0),
        tags: String(formData.get('tags') ?? '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        note: String(formData.get('note') ?? '') || null,
      }),
    onSuccess: () => {
      toast.success(t('toast.entry_created'));
      invalidateProgress();
    },
  });
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
  const entries = entriesQuery.data?.ok ? entriesQuery.data.entries : [];
  const goals = goalsQuery.data?.ok ? goalsQuery.data.goals : [];
  const stats = statsQuery.data?.ok ? statsQuery.data : null;
  const leaderboards = leaderboardsQuery.data?.ok
    ? leaderboardsQuery.data.leaderboards
    : [];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dynamic-blue/10 ring-1 ring-dynamic-blue/20">
              <TrendingUp className="h-5 w-5 text-dynamic-blue" />
            </div>
            <div>
              <h1 className="font-bold text-2xl tracking-tight">
                {t(`views.${view}.title`)}
              </h1>
              <p className="text-muted-foreground text-sm">
                {t(`views.${view}.description`)}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            ['progress', 'goals', 'stats', 'leaderboards', 'import'] as const
          ).map((tab) =>
            onViewChange ? (
              <Button
                key={tab}
                onClick={() => onViewChange(tab)}
                size="sm"
                type="button"
                variant={tab === view ? 'default' : 'outline'}
              >
                {t(`tabs.${tab}`)}
              </Button>
            ) : (
              <Button
                key={tab}
                asChild
                size="sm"
                variant={tab === view ? 'default' : 'outline'}
              >
                <Link href={`/${routeWsId}/tasks/${tab}`}>
                  {t(`tabs.${tab}`)}
                </Link>
              </Button>
            )
          )}
        </div>
      </div>

      {hasPendingSchema ? (
        <Card>
          <CardContent className="py-8 text-sm">
            {t('schema_unavailable')}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          icon={<BarChart3 className="h-4 w-4" />}
          label={t('summary.total')}
          value={stats?.summary.total ?? 0}
        />
        <SummaryCard
          icon={<Flag className="h-4 w-4" />}
          label={t('summary.entries')}
          value={stats?.summary.entriesCount ?? entries.length}
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
          createEntryMutation={createEntryMutation}
          createMetricMutation={createMetricMutation}
          entries={entries}
          metrics={metrics}
          selectedMetric={selectedMetric}
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
