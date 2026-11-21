import { CircleX, RefreshCw, TriangleAlert } from '@tuturuuu/icons';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import type { ShipSnapshot } from '../../../web/src/lib/mastermind/ship/contract';
import { formatAge, formatTime, useI18n } from '../i18n';
import { useSourceName } from './ship-summary';

export function PartialBanner({
  snapshot,
  onRetry,
  busy,
}: {
  snapshot: ShipSnapshot;
  onRetry: () => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  const name = useSourceName();
  const failed = snapshot.sources.filter(
    (source) => source.state === 'error' || source.state === 'backoff'
  );
  return (
    <Alert className="border-dynamic-orange/30 bg-dynamic-orange/5">
      <TriangleAlert className="size-4 text-dynamic-orange" aria-hidden />
      <AlertTitle>
        {t('ship.partial.title')}: {failed.map(name).join(', ')}
      </AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{t('ship.partial.body')}</span>
        <Button size="sm" variant="outline" onClick={onRetry} disabled={busy}>
          {t('ship.partial.retry')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function ErrorBanner({
  lastGood,
  now,
  onRetry,
  busy,
  showingStale,
  onToggleStale,
}: {
  lastGood: string | null;
  now: number;
  onRetry: () => void;
  busy: boolean;
  showingStale: boolean;
  onToggleStale?: () => void;
}) {
  const { t, locale } = useI18n();
  const time = lastGood ? formatTime(locale, lastGood) : '';
  return (
    <Alert role="alert" className="border-dynamic-red/30 bg-dynamic-red/5">
      <CircleX className="size-4 text-dynamic-red" aria-hidden />
      <AlertTitle>{t('ship.error.title')}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          {lastGood
            ? t('ship.error.body', {
                time,
                age: formatAge(t, now - Date.parse(lastGood)),
              })
            : t('ship.error.never')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onRetry} disabled={busy}>
            <RefreshCw
              className={cn('size-4', busy && 'animate-spin')}
              aria-hidden
            />
            {t('ship.error.retry')}
          </Button>
          {lastGood && onToggleStale ? (
            <Button size="sm" variant="outline" onClick={onToggleStale}>
              {showingStale
                ? t('ship.error.hide')
                : t('ship.error.view', { time })}
            </Button>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function LoadError({
  reason,
  onRetry,
  busy,
}: {
  reason: 'denied' | 'unavailable' | 'invalid';
  onRetry: () => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  return (
    <Alert role="alert" className="border-dynamic-red/30 bg-dynamic-red/5">
      <CircleX className="size-4 text-dynamic-red" aria-hidden />
      <AlertTitle>{t('ship.load.title')}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{t(`ship.load.${reason}`)}</p>
        {reason === 'denied' ? null : (
          <Button size="sm" onClick={onRetry} disabled={busy}>
            <RefreshCw
              className={cn('size-4', busy && 'animate-spin')}
              aria-hidden
            />
            {t('ship.error.retry')}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
