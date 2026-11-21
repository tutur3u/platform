import { RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { formatAge, useI18n } from '../i18n';
import type { ThreadErrorCode } from './contract';

/** A refused read with nothing to show; offers a retry. */
export function ThreadErrorMessage({
  code,
  retrying,
  onRetry,
}: {
  code: ThreadErrorCode;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <div role="alert" className="space-y-2 px-2 py-6 text-center">
      <p className="text-muted-foreground text-sm">
        {t(`projects.error.${code}`)}
      </p>
      <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
        <RefreshCw className={retrying ? 'animate-spin' : undefined} />
        {t('state.retry')}
      </Button>
    </div>
  );
}

/** A refused refresh over data still on screen: says how old that data is. */
export function StaleLine({
  code,
  updatedAt,
  now,
}: {
  code: ThreadErrorCode;
  updatedAt: number;
  now: number;
}) {
  const { t } = useI18n();
  return (
    <p
      role="status"
      className="mx-1 mb-1 rounded-md bg-dynamic-yellow/10 px-2 py-1.5 text-dynamic-yellow text-xs"
    >
      {code === 'machine_offline'
        ? t('projects.staleOffline', { age: formatAge(t, now - updatedAt) })
        : t(`projects.error.${code}`)}
    </p>
  );
}

/** Fixed-geometry rows while a page loads; linked machines say they are slow. */
export function LoadingRows({ slowLabel }: { slowLabel?: string }) {
  const { t } = useI18n();
  return (
    <div
      role="status"
      aria-label={slowLabel ?? t('state.loading')}
      className="space-y-2 p-2"
    >
      {slowLabel ? (
        <p className="text-muted-foreground text-xs" aria-live="polite">
          {slowLabel}
        </p>
      ) : null}
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} className="h-9 w-full" />
      ))}
    </div>
  );
}

/** The paging row under a list; it shows how many the next page brings. */
export function LoadMore({
  remaining,
  loading,
  onLoad,
  nested,
}: {
  remaining: number | undefined;
  loading: boolean;
  onLoad: () => void;
  nested: boolean;
}) {
  const { t } = useI18n();
  const n =
    remaining === undefined || remaining <= 0 ? 50 : Math.min(50, remaining);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onLoad}
      disabled={loading}
      className={
        nested ? 'ml-4 text-muted-foreground' : 'text-muted-foreground'
      }
    >
      {loading ? <RefreshCw className="animate-spin" /> : null}
      {t('projects.loadMore', { n })}
    </Button>
  );
}
