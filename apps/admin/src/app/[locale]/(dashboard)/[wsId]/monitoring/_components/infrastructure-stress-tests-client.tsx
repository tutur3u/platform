'use client';

import { Activity, Clock, Gauge, Users } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { MetricBlock } from './blue-green-monitoring-panel-primitives';
import { useInfrastructureStressTestSnapshot } from './blue-green-monitoring-query-hooks';
import { formatDecimalNumber, formatDuration } from './formatters';
import { InfrastructureStressTestControlPanel } from './infrastructure-stress-test-control-panel';
import { InfrastructureStressTestRunSummary } from './infrastructure-stress-test-run-summary';

export function InfrastructureStressTestsClient({ wsId }: { wsId: string }) {
  const t = useTranslations('blue-green-monitoring.stress_tests');
  const snapshotQuery = useInfrastructureStressTestSnapshot();
  const snapshot = snapshotQuery.data;
  const targets = snapshot?.targets ?? [];
  const profiles = snapshot?.profiles ?? [];
  const activeRun = snapshot?.activeRun ?? null;
  const canManage = snapshot?.canManage ?? false;

  if (snapshotQuery.isLoading) {
    return (
      <div className="rounded-lg border border-border/60 bg-background p-6 text-muted-foreground text-sm">
        {t('states.loading')}
      </div>
    );
  }

  if (snapshotQuery.isError || !snapshot) {
    return (
      <div className="rounded-lg border border-border/60 bg-background p-6 text-sm">
        <div className="font-medium">{t('states.unavailable')}</div>
        <Button
          className="mt-4"
          onClick={() => snapshotQuery.refetch()}
          size="sm"
          variant="outline"
        >
          {t('actions.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {activeRun ? (
            <InfrastructureStressTestRunSummary run={activeRun} wsId={wsId} />
          ) : (
            <div className="rounded-lg border border-border/60 bg-background p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md border border-border/60 bg-muted/20 p-2">
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">{t('idle.title')}</h2>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {t('idle.description')}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricBlock
              icon={<Users className="h-3.5 w-3.5" />}
              label={t('metrics.estimated_users')}
              value={formatDecimalNumber(
                activeRun?.summary.estimatedSteadyUsers
              )}
              meta={t('metrics.current_profile', {
                value: activeRun?.profile.label ?? profiles[0]?.label ?? '-',
              })}
            />
            <MetricBlock
              icon={<Gauge className="h-3.5 w-3.5" />}
              label={t('metrics.average_rps')}
              value={formatDecimalNumber(
                activeRun?.summary.averageRequestsPerSecond
              )}
              meta={t('metrics.total_requests', {
                value: formatDecimalNumber(activeRun?.summary.totalRequests),
              })}
            />
            <MetricBlock
              icon={<Clock className="h-3.5 w-3.5" />}
              label={t('metrics.duration')}
              value={formatDuration(
                activeRun
                  ? (activeRun.endedAt ?? Date.now()) -
                      (activeRun.startedAt ?? activeRun.queuedAt)
                  : null
              )}
              meta={activeRun ? t('states.live') : t('states.idle')}
            />
            <MetricBlock
              icon={<Activity className="h-3.5 w-3.5" />}
              label={t('metrics.samples')}
              value={formatDecimalNumber(activeRun?.samples.length)}
              meta={t('metrics.resource_spikes')}
            />
          </div>
        </div>

        <InfrastructureStressTestControlPanel
          activeRun={activeRun}
          canManage={canManage}
          profiles={profiles}
          targets={targets}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base">{t('history.title')}</h2>
          <Badge variant="outline" className="rounded-full border-border/70">
            {snapshot.recentRuns.length}
          </Badge>
        </div>
        {snapshot.recentRuns.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-background p-6 text-muted-foreground text-sm">
            {t('history.empty')}
          </div>
        ) : (
          <div className="grid gap-3">
            {snapshot.recentRuns.map((run) => (
              <InfrastructureStressTestRunSummary
                key={run.id}
                run={run}
                wsId={wsId}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
