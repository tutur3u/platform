'use client';

import { Loader2, TriangleAlert } from '@tuturuuu/icons';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import type { MonitoringRequestsTranslations } from '../monitoring-requests/archive-primitives';

export function WatcherLogsLoadingState() {
  return (
    <div className="space-y-5">
      <div className="h-28 animate-pulse rounded-lg bg-muted/60" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            className="h-28 animate-pulse rounded-lg bg-muted/60"
            key={index}
          />
        ))}
      </div>
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-border bg-card">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}

export function WatcherLogsErrorState({
  onRetry,
  t,
}: {
  onRetry: () => void;
  t: MonitoringRequestsTranslations;
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
