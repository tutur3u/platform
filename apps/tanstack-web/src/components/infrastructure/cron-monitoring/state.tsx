'use client';

import { TriangleAlert } from '@tuturuuu/icons';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import type { CronMonitoringTranslations } from './status';

export function CronMonitoringLoadingState() {
  return (
    <div className="space-y-5">
      <div className="h-36 animate-pulse rounded-lg bg-muted/60" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-lg bg-muted/60"
          />
        ))}
      </div>
      <div className="h-[360px] animate-pulse rounded-lg bg-muted/60" />
    </div>
  );
}

export function CronMonitoringErrorState({
  onRetry,
  t,
}: {
  onRetry: () => void;
  t: CronMonitoringTranslations;
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
