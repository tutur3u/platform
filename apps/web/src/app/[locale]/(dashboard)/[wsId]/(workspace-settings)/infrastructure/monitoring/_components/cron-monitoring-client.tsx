'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Clock,
  ListRestart,
  Power,
  Radio,
  Terminal,
  TriangleAlert,
  XCircle,
} from '@tuturuuu/icons';
import {
  type CronExecutionRecord,
  type CronExecutionStatus,
  type CronMonitoringJob,
  type CronRunRecord,
  type CronRunStatus,
  queueCronRun,
  updateCronMonitoringControl,
} from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import cronstrue from 'cronstrue';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  useCronMonitoringExecutionArchive,
  useCronMonitoringSnapshot,
} from './blue-green-monitoring-query-hooks';
import {
  BlueGreenMonitoringErrorState,
  BlueGreenMonitoringLoadingState,
} from './blue-green-monitoring-state';
import {
  formatClockTime,
  formatCompactNumber,
  formatDateTime,
  formatDuration,
  formatRelativeTime,
} from './formatters';

function describeSchedule(schedule: string) {
  try {
    return cronstrue.toString(schedule, {
      throwExceptionOnParseError: false,
      verbose: true,
    });
  } catch {
    return schedule;
  }
}

function getStatusIcon(status: CronExecutionStatus | null | undefined) {
  if (status === 'success') {
    return <CheckCircle2 className="h-4 w-4 text-dynamic-green" />;
  }

  if (status === 'timeout') {
    return <Clock className="h-4 w-4 text-dynamic-yellow" />;
  }

  if (status === 'failed') {
    return <XCircle className="h-4 w-4 text-dynamic-red" />;
  }

  return <Radio className="h-4 w-4 text-muted-foreground" />;
}

function getRunStatusIcon(status: CronRunStatus | null | undefined) {
  if (status === 'success') {
    return <CheckCircle2 className="h-4 w-4 text-dynamic-green" />;
  }

  if (status === 'processing') {
    return <Activity className="h-4 w-4 animate-pulse text-dynamic-blue" />;
  }

  if (status === 'queued') {
    return <Clock className="h-4 w-4 text-dynamic-yellow" />;
  }

  if (status === 'timeout' || status === 'failed') {
    return <XCircle className="h-4 w-4 text-dynamic-red" />;
  }

  return <Radio className="h-4 w-4 text-muted-foreground" />;
}

function getStatusLabel(
  t: ReturnType<typeof useTranslations>,
  status: CronExecutionStatus | null | undefined
) {
  if (!status) return t('cron.states.pending');
  return t(`cron.execution_status.${status}`);
}

function isRunInFlight(run: CronRunRecord | null | undefined) {
  return run?.status === 'queued' || run?.status === 'processing';
}

function getRunStatusLabel(
  t: ReturnType<typeof useTranslations>,
  status: CronRunStatus | null | undefined
) {
  if (status === 'success') return t('cron.run_status.done');
  if (status === 'processing') return t('cron.run_status.processing');
  if (status === 'queued') return t('cron.run_status.queued');
  if (status === 'failed' || status === 'timeout') {
    return t('cron.run_status.errored');
  }
  if (status === 'skipped') return t('cron.run_status.skipped');
  return t('cron.states.pending');
}

function getRunStatusBadgeClass(status: CronRunStatus | null | undefined) {
  if (status === 'success') {
    return 'border-dynamic-green/35 bg-dynamic-green/10 text-dynamic-green';
  }

  if (status === 'processing') {
    return 'border-dynamic-blue/35 bg-dynamic-blue/10 text-dynamic-blue';
  }

  if (status === 'queued') {
    return 'border-dynamic-yellow/35 bg-dynamic-yellow/10 text-dynamic-yellow';
  }

  if (status === 'failed' || status === 'timeout') {
    return 'border-dynamic-red/35 bg-dynamic-red/10 text-dynamic-red';
  }

  return 'border-border text-muted-foreground';
}

function JobRuntimeRow({
  job,
  onOpenExecution,
  onOpenRun,
  onRun,
  run,
  running,
  t,
}: {
  job: CronMonitoringJob;
  onOpenExecution: (execution: CronExecutionRecord) => void;
  onOpenRun: (run: CronRunRecord) => void;
  onRun: (jobId: string) => void;
  run: CronRunRecord | null;
  running: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const lastExecution = job.lastExecution;
  const hasFailure = (job.failureStreak ?? 0) > 0;
  const runInFlight = isRunInFlight(run);

  return (
    <div className="group grid gap-4 border-border/60 border-t p-4 transition-colors first:border-t-0 hover:bg-foreground/[0.025] lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.9fr)_minmax(180px,0.55fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium text-sm">{job.id}</p>
          <Badge
            variant="outline"
            className={cn(
              'rounded-full',
              job.enabled
                ? 'border-dynamic-green/35 text-dynamic-green'
                : 'border-border text-muted-foreground'
            )}
          >
            {job.enabled ? t('cron.states.enabled') : t('cron.states.disabled')}
          </Badge>
          {hasFailure ? (
            <Badge
              variant="outline"
              className="rounded-full border-dynamic-red/35 text-dynamic-red"
            >
              {t('cron.failure_streak', { count: job.failureStreak })}
            </Badge>
          ) : null}
          {run ? (
            <button
              type="button"
              onClick={() => onOpenRun(run)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-xs',
                getRunStatusBadgeClass(run.status)
              )}
            >
              {getRunStatusIcon(run.status)}
              {getRunStatusLabel(t, run.status)}
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-muted-foreground text-sm leading-6">
          {job.description}
        </p>
        <code className="mt-2 block truncate rounded-md bg-muted/40 px-2 py-1 font-mono text-muted-foreground text-xs">
          {job.path}
        </code>
      </div>

      <div className="min-w-0">
        <p className="font-mono text-sm">{job.schedule}</p>
        <p className="mt-1 text-muted-foreground text-xs leading-5">
          {describeSchedule(job.schedule)}
        </p>
      </div>

      <div className="min-w-0 space-y-2 text-sm">
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
            {t('cron.next_run')}
          </p>
          <p className="mt-1 font-medium">
            {formatRelativeTime(job.nextRunAt)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
            {t('cron.last_run')}
          </p>
          <p className="mt-1 font-medium">
            {lastExecution ? formatRelativeTime(lastExecution.startedAt) : '—'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 lg:justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRun(job.id)}
          disabled={running || runInFlight || !job.enabled}
        >
          <ListRestart className="mr-2 h-4 w-4" />
          {running
            ? t('cron.actions.queueing')
            : runInFlight
              ? getRunStatusLabel(t, run?.status)
              : t('cron.actions.run_now')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            run
              ? onOpenRun(run)
              : lastExecution && onOpenExecution(lastExecution)
          }
          disabled={!run && !lastExecution}
        >
          <Terminal className="mr-2 h-4 w-4" />
          {t('cron.actions.logs')}
        </Button>
      </div>
    </div>
  );
}

export function CronMonitoringClient() {
  const t = useTranslations('blue-green-monitoring');
  const queryClient = useQueryClient();
  const snapshotQuery = useCronMonitoringSnapshot();
  const archiveQuery = useCronMonitoringExecutionArchive({
    page: 1,
    pageSize: 12,
  });
  const [selectedDetail, setSelectedDetail] = useState<
    | { record: CronExecutionRecord; type: 'execution' }
    | { id: string; type: 'run' }
    | null
  >(null);

  const invalidateCron = () =>
    queryClient.invalidateQueries({
      queryKey: ['infrastructure', 'monitoring', 'cron'],
    });

  const runMutation = useMutation({
    mutationFn: (jobId: string) => queueCronRun({ jobId }),
    onSuccess: invalidateCron,
  });
  const controlMutation = useMutation({
    mutationFn: (enabled: boolean) => updateCronMonitoringControl({ enabled }),
    onSuccess: invalidateCron,
  });

  const snapshot = snapshotQuery.data;
  const executions = archiveQuery.data?.items ?? [];
  const runByJobId = useMemo(() => {
    const map = new Map<string, CronRunRecord>();

    for (const run of snapshot?.runs ?? []) {
      const current = map.get(run.jobId);
      if (!current || run.requestedAt > current.requestedAt) {
        map.set(run.jobId, run);
      }
    }

    return map;
  }, [snapshot?.runs]);
  const selectedRun =
    selectedDetail?.type === 'run'
      ? (snapshot?.runs.find((run) => run.id === selectedDetail.id) ?? null)
      : null;
  const selectedExecution =
    selectedDetail?.type === 'execution' ? selectedDetail.record : null;
  const selectedRecord = selectedRun ?? selectedExecution;
  const selectedStatusLabel = selectedRun
    ? getRunStatusLabel(t, selectedRun.status)
    : getStatusLabel(t, selectedExecution?.status);
  const selectedStartedAt =
    selectedRecord?.startedAt ?? selectedRun?.requestedAt ?? null;
  const selectedDuration =
    selectedRecord?.durationMs ??
    (selectedRun?.status === 'processing' && selectedRun.startedAt
      ? Math.max(0, Date.now() - selectedRun.startedAt)
      : null);
  const statCards = useMemo(() => {
    if (!snapshot) return [];

    return [
      {
        icon: <Power className="h-4 w-4" />,
        label: t('cron.stats.runner'),
        meta: t('cron.stats.runner_meta'),
        value: t(`cron.runner_status.${snapshot.status}`),
      },
      {
        icon: <CalendarClock className="h-4 w-4" />,
        label: t('cron.stats.next_run'),
        meta: formatClockTime(snapshot.nextRunAt),
        value: formatRelativeTime(snapshot.nextRunAt),
      },
      {
        icon: <Activity className="h-4 w-4" />,
        label: t('cron.stats.executions'),
        meta: t('cron.stats.retained_meta'),
        value: formatCompactNumber(snapshot.overview.retainedExecutions),
      },
      {
        icon: <Clock className="h-4 w-4" />,
        label: t('cron.stats.active_runs'),
        meta: t('cron.stats.active_runs_meta', {
          queued: snapshot.overview.queuedRuns,
          processing: snapshot.overview.processingRuns,
        }),
        value: formatCompactNumber(
          snapshot.overview.queuedRuns + snapshot.overview.processingRuns
        ),
      },
      {
        icon: <TriangleAlert className="h-4 w-4" />,
        label: t('cron.stats.failed_jobs'),
        meta: t('cron.stats.failed_jobs_meta'),
        value: formatCompactNumber(snapshot.overview.failedJobs),
      },
    ];
  }, [snapshot, t]);

  if (snapshotQuery.isPending) {
    return <BlueGreenMonitoringLoadingState />;
  }

  if (snapshotQuery.error || !snapshot) {
    return (
      <BlueGreenMonitoringErrorState
        onRetry={() => snapshotQuery.refetch()}
        t={t}
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-flow-dense gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-border/60 bg-background p-5 lg:col-span-2">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <h2 className="font-semibold text-xl tracking-tight">
                {t('cron.title')}
              </h2>
              <p className="mt-2 text-muted-foreground text-sm leading-6">
                {t('cron.description')}
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <Switch
                checked={snapshot.enabled}
                disabled={controlMutation.isPending}
                onCheckedChange={(checked) => controlMutation.mutate(checked)}
              />
              <div>
                <p className="font-medium text-sm">
                  {snapshot.enabled
                    ? t('cron.states.enabled')
                    : t('cron.states.disabled')}
                </p>
                <p className="text-muted-foreground text-xs">
                  {snapshot.enabled
                    ? t('cron.control.enabled_hint')
                    : t('cron.control.disabled_hint')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-border/60 bg-background p-4 transition-transform duration-300 hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.16em]">
              {card.icon}
              <span>{card.label}</span>
            </div>
            <div className="mt-3 font-semibold text-2xl">{card.value}</div>
            <div className="mt-1 text-muted-foreground text-xs">
              {card.meta}
            </div>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-lg border border-border/60 bg-background">
        <div className="flex flex-col gap-3 border-border/60 border-b p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-semibold">{t('cron.jobs_title')}</h3>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('cron.jobs_description')}
            </p>
          </div>
          <Badge variant="outline" className="rounded-full">
            {t('cron.jobs_count', {
              enabled: snapshot.overview.enabledJobs,
              total: snapshot.overview.totalJobs,
            })}
          </Badge>
        </div>
        {snapshot.jobs.length > 0 ? (
          snapshot.jobs.map((job) => (
            <JobRuntimeRow
              key={job.id}
              job={job}
              onOpenExecution={(record) =>
                setSelectedDetail({ record, type: 'execution' })
              }
              onOpenRun={(run) =>
                setSelectedDetail({ id: run.id, type: 'run' })
              }
              onRun={(jobId) => runMutation.mutate(jobId)}
              run={runByJobId.get(job.id) ?? null}
              running={
                runMutation.isPending && runMutation.variables === job.id
              }
              t={t}
            />
          ))
        ) : (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {t('cron.empty_jobs')}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-border/60 bg-background">
        <div className="border-border/60 border-b p-4">
          <h3 className="font-semibold">{t('cron.executions_title')}</h3>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('cron.executions_description')}
          </p>
        </div>
        <div className="divide-y divide-border/60">
          {executions.length > 0 ? (
            executions.map((execution) => (
              <button
                type="button"
                key={execution.id}
                onClick={() =>
                  setSelectedDetail({ record: execution, type: 'execution' })
                }
                className="grid w-full gap-3 p-4 text-left transition-colors hover:bg-foreground/[0.025] md:grid-cols-[minmax(0,1fr)_140px_120px_100px]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(execution.status)}
                    <p className="truncate font-medium text-sm">
                      {execution.jobId}
                    </p>
                  </div>
                  <p className="mt-1 truncate text-muted-foreground text-xs">
                    {execution.path}
                  </p>
                </div>
                <div className="font-mono text-muted-foreground text-xs">
                  {formatDateTime(execution.startedAt)}
                </div>
                <div className="text-sm">
                  {getStatusLabel(t, execution.status)}
                </div>
                <div className="font-mono text-muted-foreground text-xs">
                  {formatDuration(execution.durationMs)}
                </div>
              </button>
            ))
          ) : (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {t('cron.empty_executions')}
            </div>
          )}
        </div>
      </section>

      <Dialog
        open={Boolean(selectedRecord)}
        onOpenChange={(open) => {
          if (!open) setSelectedDetail(null);
        }}
      >
        <DialogContent className="max-w-4xl">
          {selectedRecord ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedRecord.jobId}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  [t('cron.detail.status'), selectedStatusLabel],
                  [
                    t('cron.detail.started'),
                    selectedStartedAt ? formatDateTime(selectedStartedAt) : '—',
                  ],
                  [
                    t('cron.detail.duration'),
                    selectedDuration == null
                      ? '—'
                      : formatDuration(selectedDuration),
                  ],
                  [
                    t('cron.detail.http_status'),
                    selectedRecord.httpStatus?.toString() ?? '—',
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-border/60 bg-muted/20 p-3"
                  >
                    <p className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
                      {label}
                    </p>
                    <p className="mt-2 font-medium text-sm">{value}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 font-medium text-sm">
                    {t('cron.detail.response')}
                  </p>
                  <pre className="max-h-80 overflow-auto rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
                    {selectedRecord.error ||
                      selectedRecord.response ||
                      t('cron.detail.empty_response')}
                  </pre>
                </div>
                <div>
                  <p className="mb-2 font-medium text-sm">
                    {t('cron.detail.console_logs')}
                  </p>
                  <div className="max-h-80 overflow-auto rounded-lg border border-border/60 bg-muted/30 p-3">
                    {selectedRecord.consoleLogs.length > 0 ? (
                      selectedRecord.consoleLogs.map((log) => (
                        <div
                          key={`${log.time}-${log.message}`}
                          className="border-border/50 border-b py-2 last:border-b-0"
                        >
                          <div className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
                            <span>{formatClockTime(log.time)}</span>
                            <span>{log.level}</span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap font-mono text-xs">
                            {log.message}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        {t('cron.detail.empty_console_logs')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
