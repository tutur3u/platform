'use client';

import { TriangleAlert } from '@tuturuuu/icons';
import type { BlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import type { useTranslations } from 'next-intl';

type MonitoringTranslations = ReturnType<typeof useTranslations>;

export function BlueGreenMonitoringLoadingState({
  includeExplorer = false,
}: {
  includeExplorer?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="h-36 animate-pulse rounded-lg bg-muted/60" />
      <div className="grid gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-lg bg-muted/60"
          />
        ))}
      </div>
      {includeExplorer ? (
        <div className="h-[420px] animate-pulse rounded-lg bg-muted/60" />
      ) : null}
    </div>
  );
}

export function BlueGreenMonitoringErrorState({
  onRetry,
  t,
}: {
  onRetry: () => void;
  t: MonitoringTranslations;
}) {
  return (
    <Alert variant="destructive" className="rounded-lg">
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

export function BlueGreenMonitoringAlerts({
  snapshot,
  t,
}: {
  snapshot: BlueGreenMonitoringSnapshot;
  t: MonitoringTranslations;
}) {
  return (
    <>
      {!snapshot.source.monitoringDirAvailable ? (
        <Alert className="rounded-lg border-dynamic-orange/30 bg-dynamic-orange/5">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>{t('alerts.mount_missing_title')}</AlertTitle>
          <AlertDescription>
            {t('alerts.mount_missing_description')}
          </AlertDescription>
        </Alert>
      ) : null}

      {snapshot.source.monitoringDirAvailable &&
      !snapshot.source.statusAvailable ? (
        <Alert className="rounded-lg border-dynamic-blue/20 bg-dynamic-blue/5">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>{t('alerts.snapshot_missing_title')}</AlertTitle>
          <AlertDescription>
            {t('alerts.snapshot_missing_description')}
          </AlertDescription>
        </Alert>
      ) : null}

      {snapshot.watcher.health !== 'live' ? (
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
