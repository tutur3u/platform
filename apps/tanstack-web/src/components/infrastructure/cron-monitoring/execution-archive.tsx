'use client';

import type { CronExecutionRecord } from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Badge } from '@tuturuuu/ui/badge';
import { formatDateTime, formatDuration } from './formatters';
import {
  type CronMonitoringTranslations,
  getExecutionStatusIcon,
  getExecutionStatusLabel,
} from './status';

export function CronExecutionArchive({
  executions,
  onOpenExecution,
  t,
}: {
  executions: CronExecutionRecord[];
  onOpenExecution: (execution: CronExecutionRecord) => void;
  t: CronMonitoringTranslations;
}) {
  return (
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
              onClick={() => onOpenExecution(execution)}
              className="grid w-full gap-3 p-4 text-left transition-colors hover:bg-foreground/[0.025] md:grid-cols-[minmax(0,1fr)_140px_120px_100px]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {getExecutionStatusIcon(execution.status)}
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
}

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
