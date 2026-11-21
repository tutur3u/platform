import { RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import type { FleetPageState } from '../fleet/page-state';
import { formatAge, useI18n } from '../i18n';
import { SectionMessage } from './section';
import { toneDot } from './tone';

export function FreshnessLine({
  state,
  receivedAt,
  now,
}: {
  state: FleetPageState['kind'];
  receivedAt?: string;
  now: number;
}) {
  const { t } = useI18n();
  const live = state === 'ready';
  return (
    <div
      className="flex items-center gap-2 px-2 text-muted-foreground text-xs"
      aria-live="polite"
    >
      <span
        className={toneDot(
          live ? 'green' : state === 'stale' ? 'yellow' : 'gray'
        )}
        aria-hidden
      />
      {receivedAt
        ? t(live ? 'fresh.live' : 'fresh.stale', {
            age: formatAge(t, now - Date.parse(receivedAt)),
          })
        : t('fresh.loading')}
    </div>
  );
}

/** Fixed-geometry placeholder for the digest and inbox while a load runs. */
export function LoadingState() {
  const { t } = useI18n();
  return (
    <div role="status" aria-label={t('state.loading')} className="space-y-4">
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

export function BlockingState({
  state,
  retrying,
  onRetry,
}: {
  state: Extract<FleetPageState, { kind: 'error' | 'unpublished' }>;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <SectionMessage tone={state.kind === 'error' ? 'error' : 'empty'}>
      <div className="space-y-3">
        <p>
          {state.kind === 'error'
            ? t(`state.${state.reason}`)
            : t('state.unpublished')}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          disabled={retrying}
        >
          <RefreshCw className={retrying ? 'animate-spin' : undefined} />
          {t('state.retry')}
        </Button>
      </div>
    </SectionMessage>
  );
}

export function StaleNotice({
  reason,
  onRetry,
  retrying,
}: {
  reason: Extract<FleetPageState, { kind: 'stale' }>['reason'];
  onRetry: () => void;
  retrying: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dynamic-yellow/20 bg-dynamic-yellow/10 px-4 py-3 text-dynamic-yellow text-sm">
      <span>{reason === 'old' ? t('state.stale') : t(`state.${reason}`)}</span>
      <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
        <RefreshCw className={retrying ? 'animate-spin' : undefined} />
        {t('reload')}
      </Button>
    </div>
  );
}
