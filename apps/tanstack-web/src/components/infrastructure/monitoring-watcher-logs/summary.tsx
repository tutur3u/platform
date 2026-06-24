'use client';

import type { BlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Badge } from '@tuturuuu/ui/badge';
import type { MonitoringRequestsTranslations } from '../monitoring-requests/archive-primitives';
import { SummaryMetricCard } from '../monitoring-requests/archive-primitives';
import { formatClockTime, formatRelativeTime } from './formatters';

export function WatcherSnapshotSummary({
  snapshot,
  t,
}: {
  snapshot: BlueGreenMonitoringSnapshot;
  t: MonitoringRequestsTranslations;
}) {
  const watcher = snapshot.watcher;
  const targetBranch = watcher.target?.branch ?? watcher.lock?.branch ?? null;
  const latestCommit =
    watcher.latestCommit?.shortHash ?? watcher.latestCommit?.hash ?? null;

  return (
    <section className="rounded-lg border border-border/60 bg-background p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
            {t('watcher.title')}
          </p>
          <h2 className="mt-1 font-semibold text-xl">
            {targetBranch ?? t('states.none')}
          </h2>
          <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
            {watcher.latestCommit?.subject ?? t('ledger.no_commit_subject')}
          </p>
        </div>
        <Badge className="rounded-full" variant="secondary">
          {t('watcher.badge', { health: watcher.health })}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetricCard
          icon={<span className="h-2 w-2 rounded-full bg-current" />}
          label={t('watcher.last_check')}
          meta={formatClockTime(watcher.lastCheckAt)}
          value={formatRelativeTime(watcher.lastCheckAt)}
        />
        <SummaryMetricCard
          icon={<span className="h-2 w-2 rounded-full bg-current" />}
          label={t('watcher.next_check')}
          meta={formatClockTime(watcher.nextCheckAt)}
          value={formatRelativeTime(watcher.nextCheckAt)}
        />
        <SummaryMetricCard
          icon={<span className="h-2 w-2 rounded-full bg-current" />}
          label={t('watcher.last_result')}
          meta={watcher.lastDeployStatus ?? t('states.none')}
          value={latestCommit ?? t('states.none')}
        />
        <SummaryMetricCard
          icon={<span className="h-2 w-2 rounded-full bg-current" />}
          label={t('watcher.upstream')}
          meta={watcher.target?.upstreamRef ?? t('states.none')}
          value={targetBranch ?? t('states.none')}
        />
      </div>
    </section>
  );
}
