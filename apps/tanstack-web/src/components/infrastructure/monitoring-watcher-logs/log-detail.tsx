'use client';

import type { BlueGreenMonitoringWatcherLog } from '@tuturuuu/internal-api/infrastructure/monitoring';
import type { MonitoringRequestsTranslations } from '../monitoring-requests/archive-primitives';
import { formatDateTime } from './formatters';
import { getWatcherLogDeploymentLabel } from './log-utils';

export function WatcherLogDetail({
  log,
  t,
}: {
  log: BlueGreenMonitoringWatcherLog | null;
  t: MonitoringRequestsTranslations;
}) {
  if (!log) {
    return null;
  }

  const metadata =
    log.metadata && Object.keys(log.metadata).length > 0
      ? JSON.stringify(log.metadata, null, 2)
      : null;

  return (
    <aside className="rounded-xl border border-border/60 bg-background p-4">
      <div>
        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
          {t('panels.logs')}
        </p>
        <h3 className="mt-2 break-words font-semibold text-lg">
          {getWatcherLogDeploymentLabel(log, t('states.none'))}
        </h3>
        <p className="mt-2 text-muted-foreground text-xs">
          {formatDateTime(log.time)}
        </p>
      </div>

      <div className="mt-5 grid gap-3">
        <DetailRow label={t('explorer.level_filter')} value={log.level} />
        <DetailRow
          label={t('explorer.rollout_status_filter')}
          value={log.deploymentStatus ?? t('states.none')}
        />
        <DetailRow
          label={t('explorer.table_deployment')}
          value={log.deploymentKey ?? log.deploymentStamp ?? t('states.none')}
        />
        <DetailRow
          label={t('hero.commit')}
          value={log.commitHash ?? t('states.none')}
        />
        <DetailRow
          label={t('stats.active_color')}
          value={log.activeColor ?? t('states.none')}
        />
        <DetailRow
          label={t('panels.events')}
          value={log.incidentId ?? log.eventId ?? t('states.none')}
        />
      </div>

      <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-3">
        <p className="text-muted-foreground text-xs">
          {t('observability.logs_panel.metadata')}
        </p>
        <p className="mt-2 whitespace-pre-wrap break-words font-mono text-sm leading-6">
          {log.message}
        </p>
      </div>

      {metadata ? (
        <pre className="mt-4 max-h-72 overflow-auto rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
          {metadata}
        </pre>
      ) : null}
    </aside>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 break-all font-medium text-sm">{value}</p>
    </div>
  );
}
