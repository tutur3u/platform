'use client';

import type { BlueGreenMonitoringWatcherLog } from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import {
  type MonitoringRequestsTranslations,
  StatusBadge,
} from '../monitoring-requests/archive-primitives';
import {
  formatClockTime,
  formatDateTime,
  formatRelativeTime,
} from './formatters';
import {
  getDeploymentStatusTranslationKey,
  getWatcherLogDeploymentLabel,
  getWatcherLogKey,
} from './log-utils';

export function WatcherLogList({
  logs,
  onSelect,
  selectedLogKey,
  t,
}: {
  logs: BlueGreenMonitoringWatcherLog[];
  onSelect: (log: BlueGreenMonitoringWatcherLog) => void;
  selectedLogKey: string | null;
  t: MonitoringRequestsTranslations;
}) {
  return (
    <div className="divide-y divide-border/60">
      {logs.map((log, index) => {
        const logKey = getWatcherLogKey(log, index);
        const deploymentLabel = getWatcherLogDeploymentLabel(
          log,
          t('states.none')
        );

        return (
          <button
            className={cn(
              'block w-full space-y-4 px-4 py-4 text-left transition-colors hover:bg-muted/40',
              selectedLogKey === logKey && 'bg-dynamic-blue/5'
            )}
            key={logKey}
            onClick={() => onSelect(log)}
            type="button"
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    tone={
                      log.level === 'error'
                        ? 'destructive'
                        : log.level === 'warn'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {log.level.toUpperCase()}
                  </StatusBadge>
                  <Badge className="rounded-full" variant="outline">
                    {deploymentLabel}
                  </Badge>
                  {log.deploymentStatus ? (
                    <Badge className="rounded-full" variant="outline">
                      {t(
                        getDeploymentStatusTranslationKey(log.deploymentStatus)
                      )}
                    </Badge>
                  ) : null}
                  {log.eventType ? (
                    <Badge className="rounded-full" variant="secondary">
                      {log.eventType}
                    </Badge>
                  ) : log.deploymentKind ? (
                    <Badge className="rounded-full" variant="secondary">
                      {log.deploymentKind}
                    </Badge>
                  ) : null}
                </div>

                <p className="whitespace-pre-wrap break-words font-mono text-sm leading-6">
                  {log.message}
                </p>

                <div className="flex flex-wrap gap-3 text-muted-foreground text-xs">
                  <span>{log.commitHash ?? t('states.none')}</span>
                  <span>{log.activeColor ?? t('states.none')}</span>
                  <span>{formatDateTime(log.time)}</span>
                </div>
              </div>

              <div className="shrink-0 space-y-2 text-sm xl:text-right">
                <div className="font-medium">{formatClockTime(log.time)}</div>
                <div className="text-muted-foreground text-xs">
                  {formatRelativeTime(log.time)}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
