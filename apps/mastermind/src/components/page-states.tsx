import { Pause, RefreshCw, WifiOff } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import type { FleetPageState } from '../fleet/page-state';
import { formatAge, formatTime, useI18n } from '../i18n';
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
      {receivedAt ? (
        t(live ? 'fresh.live' : 'fresh.stale', {
          age: formatAge(t, now - Date.parse(receivedAt)),
        })
      ) : (
        <>
          <Skeleton aria-hidden="true" className="h-3 w-24" />
          <span className="sr-only">{t('fresh.loading')}</span>
        </>
      )}
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

/**
 * Which side is stale. "Publisher paused": this page reaches Web, but the
 * orchestrator Mac has stopped publishing. "Device offline": this page
 * cannot reach Web, so the publisher may still be running.
 */
export function FreshnessBanner({
  state,
  generatedAt,
  checkedAt,
  machine,
  now,
  retrying,
  onRetry,
}: {
  state: FleetPageState;
  generatedAt?: string;
  checkedAt: string;
  machine?: string;
  now: number;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t, locale } = useI18n();
  const checked = formatAge(t, now - Date.parse(checkedAt));
  const published = generatedAt
    ? formatAge(t, now - Date.parse(generatedAt))
    : undefined;
  const who = machine ?? t('banner.theMac');
  if (state.kind === 'ready')
    return (
      <p className="flex items-center gap-2 text-muted-foreground text-sm">
        <span className={toneDot('green')} aria-hidden />
        {t('banner.live', { machine: who, age: published ?? '', checked })}
      </p>
    );
  if (state.kind !== 'stale') return null;
  if (state.reason !== 'old' && state.reason !== 'unavailable')
    return (
      <StaleNotice
        reason={state.reason}
        onRetry={onRetry}
        retrying={retrying}
      />
    );
  const paused = state.reason === 'old';
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3 text-sm',
        paused
          ? 'border-dynamic-orange/20 bg-dynamic-orange/10'
          : 'border-dynamic-gray/20 bg-dynamic-gray/10'
      )}
    >
      {paused ? (
        <Pause className="mt-0.5 size-4 text-dynamic-orange" />
      ) : (
        <WifiOff className="mt-0.5 size-4 text-dynamic-gray" />
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-semibold">
          {paused ? t('banner.paused', { machine: who }) : t('banner.offline')}
        </p>
        <p className="text-muted-foreground">
          {paused
            ? t('banner.pausedBody', {
                time: generatedAt ? formatTime(locale, generatedAt) : '',
                age: published ?? '',
                checked,
              })
            : t('banner.offlineBody', { time: formatTime(locale, checkedAt) })}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
        <RefreshCw className={retrying ? 'animate-spin' : undefined} />
        {paused ? t('reload') : t('state.retry')}
      </Button>
    </div>
  );
}
