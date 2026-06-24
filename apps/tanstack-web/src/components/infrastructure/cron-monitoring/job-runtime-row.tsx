'use client';

import { ListRestart, Terminal } from '@tuturuuu/icons';
import type {
  CronExecutionRecord,
  CronMonitoringJob,
  CronRunRecord,
} from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { formatRelativeTime } from './formatters';
import { describeSchedule } from './schedule';
import {
  type CronMonitoringTranslations,
  getRunStatusBadgeClass,
  getRunStatusIcon,
  getRunStatusLabel,
  isCronRunInFlight,
} from './status';

export function JobRuntimeRow({
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
  t: CronMonitoringTranslations;
}) {
  const lastExecution = job.lastExecution;
  const hasFailure = (job.failureStreak ?? 0) > 0;
  const runInFlight = isCronRunInFlight(run);

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
          {describeSchedule(job.schedule, t)}
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
            {lastExecution ? formatRelativeTime(lastExecution.startedAt) : '-'}
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
