'use client';

import { TriangleAlert } from '@tuturuuu/icons';
import type { BlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import type { useTranslations } from 'use-intl';

export type MonitoringRolloutsTranslations = ReturnType<typeof useTranslations>;

function hasInProgressDeployment(snapshot: BlueGreenMonitoringSnapshot) {
  const latestDeployment = snapshot.deployments[0];

  return (
    latestDeployment?.status === 'building' ||
    latestDeployment?.status === 'deploying'
  );
}

export function MonitoringRolloutsLoadingState() {
  return (
    <div className="space-y-6">
      <div className="h-36 animate-pulse rounded-lg bg-muted/60" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-lg bg-muted/60"
          />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div className="h-[340px] animate-pulse rounded-lg bg-muted/60" />
        <div className="h-[340px] animate-pulse rounded-lg bg-muted/60" />
      </div>
    </div>
  );
}

export function MonitoringRolloutsErrorState({
  onRetry,
  t,
}: {
  onRetry: () => void;
  t: MonitoringRolloutsTranslations;
}) {
  return (
    <Alert className="rounded-lg" variant="destructive">
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>{t('alerts.failed_title')}</AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p>{t('alerts.failed_description')}</p>
        <Button onClick={onRetry} variant="outline">
          {t('actions.retry')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function MonitoringRolloutsAlerts({
  snapshot,
  t,
}: {
  snapshot: BlueGreenMonitoringSnapshot;
  t: MonitoringRolloutsTranslations;
}) {
  const showMountMissingAlert = !snapshot.source.monitoringDirAvailable;
  const showSnapshotMissingAlert =
    snapshot.source.monitoringDirAvailable && !snapshot.source.statusAvailable;
  const showWatcherDegradedAlert =
    snapshot.source.monitoringDirAvailable &&
    snapshot.source.statusAvailable &&
    !hasInProgressDeployment(snapshot) &&
    snapshot.watcher.health !== 'live';

  return (
    <>
      {showMountMissingAlert ? (
        <Alert className="rounded-lg border-dynamic-orange/30 bg-dynamic-orange/5">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>{t('alerts.mount_missing_title')}</AlertTitle>
          <AlertDescription>
            {t('alerts.mount_missing_description')}
          </AlertDescription>
        </Alert>
      ) : null}

      {showSnapshotMissingAlert ? (
        <Alert className="rounded-lg border-dynamic-blue/20 bg-dynamic-blue/5">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>{t('alerts.snapshot_missing_title')}</AlertTitle>
          <AlertDescription>
            {t('alerts.snapshot_missing_description')}
          </AlertDescription>
        </Alert>
      ) : null}

      {showWatcherDegradedAlert ? (
        <Alert className="rounded-lg border-dynamic-blue/20 bg-dynamic-blue/5">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>{t('alerts.watcher_degraded_title')}</AlertTitle>
          <AlertDescription>
            {t(`alerts.watcher_degraded_${snapshot.watcher.health}`)}
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
