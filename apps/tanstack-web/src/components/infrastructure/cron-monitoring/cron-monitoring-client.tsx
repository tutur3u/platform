'use client';

import type {
  CronExecutionRecord,
  CronRunRecord,
} from '@tuturuuu/internal-api/infrastructure/monitoring';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import { CronExecutionArchive, CronJobsCountBadge } from './execution-archive';
import { CronExecutionDetailDialog } from './execution-detail-dialog';
import { JobRuntimeRow } from './job-runtime-row';
import { CronMonitoringOverview } from './overview';
import {
  useCronMonitoringExecutionArchive,
  useCronMonitoringSnapshot,
  useQueueCronRun,
  useUpdateCronMonitoringControl,
} from './query-hooks';
import { CronMonitoringErrorState, CronMonitoringLoadingState } from './state';
import { getExecutionStatusLabel, getRunStatusLabel } from './status';

type SelectedCronDetail =
  | { id: string; type: 'execution' }
  | { id: string; type: 'run' }
  | null;

export function CronMonitoringClient() {
  const t = useTranslations('blue-green-monitoring');
  const snapshotQuery = useCronMonitoringSnapshot();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const archiveQuery = useCronMonitoringExecutionArchive({
    jobId: selectedJobId ?? undefined,
    page: 1,
    pageSize: 12,
  });
  const runMutation = useQueueCronRun();
  const controlMutation = useUpdateCronMonitoringControl();
  const [selectedDetail, setSelectedDetail] =
    useState<SelectedCronDetail>(null);
  const executionArchiveRef = useRef<HTMLElement | null>(null);
  const snapshot = snapshotQuery.data;
  const executions = archiveQuery.data?.items ?? [];
  const executionById = useMemo(() => {
    const map = new Map<string, CronExecutionRecord>();

    if (snapshot?.lastExecution) {
      map.set(snapshot.lastExecution.id, snapshot.lastExecution);
    }

    for (const job of snapshot?.jobs ?? []) {
      if (job.lastExecution) {
        map.set(job.lastExecution.id, job.lastExecution);
      }
    }

    for (const execution of executions) {
      map.set(execution.id, execution);
    }

    return map;
  }, [executions, snapshot?.jobs, snapshot?.lastExecution]);
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
    selectedDetail?.type === 'execution'
      ? (executionById.get(selectedDetail.id) ?? null)
      : null;
  const selectedRecord = selectedRun ?? selectedExecution;
  const selectedStatusLabel = selectedRun
    ? getRunStatusLabel(t, selectedRun.status)
    : getExecutionStatusLabel(t, selectedExecution?.status);
  const selectedStartedAt =
    selectedRecord?.startedAt ?? selectedRun?.requestedAt ?? null;
  const selectedDuration =
    selectedRecord?.durationMs ??
    (selectedRun?.status === 'processing' && selectedRun.startedAt
      ? Math.max(0, Date.now() - selectedRun.startedAt)
      : null);
  const handleOpenJobExecutions = (jobId: string) => {
    setSelectedJobId(jobId);
    requestAnimationFrame(() => {
      if (typeof executionArchiveRef.current?.scrollIntoView === 'function') {
        executionArchiveRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    });
  };

  if (snapshotQuery.isPending) {
    return <CronMonitoringLoadingState />;
  }

  if (snapshotQuery.error || !snapshot) {
    return (
      <CronMonitoringErrorState onRetry={() => snapshotQuery.refetch()} t={t} />
    );
  }

  return (
    <div className="space-y-5">
      <CronMonitoringOverview
        onEnabledChange={(enabled) => controlMutation.mutate({ enabled })}
        snapshot={snapshot}
        t={t}
        updatingControl={controlMutation.isPending}
      />

      <section className="overflow-hidden rounded-lg border border-border/60 bg-background">
        <div className="flex flex-col gap-3 border-border/60 border-b p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-semibold">{t('cron.jobs_title')}</h3>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('cron.jobs_description')}
            </p>
          </div>
          <CronJobsCountBadge
            enabled={snapshot.overview.enabledJobs}
            t={t}
            total={snapshot.overview.totalJobs}
          />
        </div>
        {snapshot.jobs.length > 0 ? (
          snapshot.jobs.map((job) => (
            <JobRuntimeRow
              key={job.id}
              job={job}
              onOpenExecution={(record) =>
                setSelectedDetail({ id: record.id, type: 'execution' })
              }
              onOpenExecutions={handleOpenJobExecutions}
              onOpenRun={(run) =>
                setSelectedDetail({ id: run.id, type: 'run' })
              }
              onRun={(jobId) => runMutation.mutate({ jobId })}
              run={runByJobId.get(job.id) ?? null}
              running={
                runMutation.isPending && runMutation.variables?.jobId === job.id
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

      <CronExecutionArchive
        executions={executions}
        onClearJob={() => setSelectedJobId(null)}
        onOpenExecution={(record) =>
          setSelectedDetail({ id: record.id, type: 'execution' })
        }
        onRefresh={() => archiveQuery.refetch()}
        refreshing={archiveQuery.isFetching}
        ref={executionArchiveRef}
        selectedJobId={selectedJobId}
        t={t}
      />

      <CronExecutionDetailDialog
        duration={selectedDuration}
        onOpenChange={(open) => {
          if (!open) setSelectedDetail(null);
        }}
        record={selectedRecord}
        startedAt={selectedStartedAt}
        statusLabel={selectedStatusLabel}
        t={t}
      />
    </div>
  );
}
