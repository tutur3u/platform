'use client';

import { RefreshCw } from '@tuturuuu/icons';
import type { CronExecutionRecord } from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { forwardRef } from 'react';
import { formatDateTime, formatDuration } from './formatters';
import {
  type CronMonitoringTranslations,
  getExecutionStatusIcon,
  getExecutionStatusLabel,
} from './status';

interface CronExecutionArchiveProps {
  executions: CronExecutionRecord[];
  onClearJob: () => void;
  onOpenExecution: (execution: CronExecutionRecord) => void;
  onRefresh: () => void;
  refreshing: boolean;
  selectedJobId: string | null;
  t: CronMonitoringTranslations;
}

export const CronExecutionArchive = forwardRef<
  HTMLElement,
  CronExecutionArchiveProps
>(function CronExecutionArchive(
  {
    executions,
    onClearJob,
    onOpenExecution,
    onRefresh,
    refreshing,
    selectedJobId,
    t,
  },
  ref
) {
  return (
    <section
      className="overflow-hidden rounded-lg border border-border/60 bg-background"
      id="cron-execution-history"
      ref={ref}
    >
      <div className="flex flex-col gap-3 border-border/60 border-b p-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">
              {selectedJobId
                ? t('cron.executions_filtered_title')
                : t('cron.executions_title')}
            </h3>
            {selectedJobId ? (
              <Badge variant="outline" className="max-w-full rounded-full">
                <span className="truncate">{selectedJobId}</span>
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-muted-foreground text-sm">
            {selectedJobId
              ? t('cron.executions_filtered_description')
              : t('cron.executions_description')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedJobId ? (
            <Button variant="ghost" size="sm" onClick={onClearJob}>
              {t('cron.actions.clear_filter')}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('cron.actions.refresh')}
          </Button>
        </div>
      </div>
      <div className="divide-y divide-border/60">
        {executions.length > 0 ? (
          executions.map((execution) => (
            <button
              type="button"
              key={execution.id}
              onClick={() => onOpenExecution(execution)}
              className="grid w-full gap-3 p-4 text-left transition-colors hover:bg-foreground/[0.025] lg:grid-cols-[minmax(0,1fr)_minmax(140px,auto)_120px_100px]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {getExecutionStatusIcon(execution.status)}
                  <p className="break-words font-medium text-sm">
                    {execution.jobId}
                  </p>
                  <Badge variant="outline" className="rounded-full">
                    {execution.source}
                  </Badge>
                </div>
                <p className="mt-1 break-all text-muted-foreground text-xs">
                  {execution.path}
                </p>
              </div>
              <div className="font-mono text-muted-foreground text-xs">
                {formatDateTime(execution.startedAt)}
              </div>
              <div className="text-sm">
                {getExecutionStatusLabel(t, execution.status)}
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
  );
});

export function CronJobsCountBadge({
  enabled,
  t,
  total,
}: {
  enabled: number;
  t: CronMonitoringTranslations;
  total: number;
}) {
  return (
    <Badge variant="outline" className="rounded-full">
      {t('cron.jobs_count', { enabled, total })}
    </Badge>
  );
}
