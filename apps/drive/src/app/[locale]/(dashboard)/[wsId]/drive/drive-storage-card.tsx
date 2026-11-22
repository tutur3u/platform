'use client';

import { HardDrive, RefreshCw, TriangleAlert } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Progress } from '@tuturuuu/ui/progress';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn, formatBytes } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  type DriveQuotaState,
  driveQuotaIndicator,
  resolveDriveQuotaState,
} from './drive-storage-quota';
import { useWorkspaceStorageAnalyticsQuery } from './use-drive-queries';

export function useDriveQuota(wsId: string, { enabled = true } = {}) {
  const query = useWorkspaceStorageAnalyticsQuery(wsId, { enabled });
  return {
    refetch: () => void query.refetch(),
    state: resolveDriveQuotaState(query),
  };
}

function QuotaBody({
  onRetry,
  state,
}: {
  onRetry: () => void;
  state: DriveQuotaState;
}) {
  const t = useTranslations('drive');

  switch (state.kind) {
    case 'loading':
      return (
        <div aria-busy="true" className="space-y-2">
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      );
    case 'error':
      return (
        <div className="flex items-center gap-2" role="alert">
          <span className="flex-1 text-muted-foreground text-xs">
            {t('storage.load_failed')}
          </span>
          <Button
            aria-label={t('states.retry')}
            onClick={onRetry}
            size="icon"
            type="button"
            variant="ghost"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      );
    case 'ready':
      return (
        <div className="space-y-2">
          <Progress
            aria-label={t('storage.used_label')}
            className="h-2 bg-muted"
            indicatorClassName={driveQuotaIndicator[state.tone]}
            value={Math.min(100, state.percent)}
          />
          <p className="text-muted-foreground text-xs">
            {t('storage.used_of', {
              used: formatBytes(state.used),
              limit: formatBytes(state.limit),
            })}
          </p>
          {state.tone === 'normal' ? null : (
            <p
              className={cn(
                'flex items-center gap-1.5 font-semibold text-xs',
                state.tone === 'critical'
                  ? 'text-destructive'
                  : 'text-dynamic-orange'
              )}
            >
              <TriangleAlert aria-hidden className="size-3.5" />
              {state.tone === 'critical'
                ? t('storage.full')
                : t('storage.almost_full')}
            </p>
          )}
        </div>
      );
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

/** Workspace storage use for the sidebar, from the analytics endpoint. */
export function DriveStorageCard({ wsId }: { wsId: string }) {
  const t = useTranslations('drive');
  const { refetch, state } = useDriveQuota(wsId);

  return (
    <section
      aria-label={t('storage.title')}
      className="mx-2 mb-2 space-y-3 rounded-2xl border border-border bg-card p-4 shadow-elevation-1"
    >
      <div className="flex items-center gap-2">
        <HardDrive aria-hidden className="size-4 text-muted-foreground" />
        <strong className="text-sm">{t('storage.title')}</strong>
        {state.kind === 'ready' ? (
          <span className="ml-auto text-muted-foreground text-xs tabular-nums">
            {Math.round(state.percent)}%
          </span>
        ) : null}
      </div>
      <QuotaBody onRetry={refetch} state={state} />
    </section>
  );
}
