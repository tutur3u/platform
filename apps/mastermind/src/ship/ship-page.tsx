import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Rocket } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { useRef, useState } from 'react';
import { PageHeader, Preferences, Shell } from '../components/shell';
import { useNow } from '../fleet/clock';
import { formatAge, formatTime, type Translate, useI18n } from '../i18n';
import type { ShipCheck, ShipRead } from '../native/ship-client';
import { lastGoodCheck, nextCheckAt, pageKind } from './model';
import { ShipGroups } from './ship-groups';
import { checkShipNow, loadShip } from './server';
import { ErrorBanner, LoadError, PartialBanner } from './ship-banners';
import { ShipStats, SourceStrip } from './ship-summary';

export const SHIP_QUERY_KEY = ['fleet', 'ship'] as const;
const REFRESH_MS = 30_000;
const CHECK_NOTE_MS = 30_000;

function checkMessage(t: Translate, result: ShipCheck | undefined) {
  if (!result) return null;
  switch (result.state) {
    case 'checked':
      return t('ship.checkDone');
    case 'rate_limited':
      return t('ship.checkLimited', {
        seconds: Math.ceil((result.retryAfterMs ?? 30_000) / 1000),
      });
    case 'stopped':
      return t('ship.checkStopped');
    case 'disabled':
      return t('ship.checkDisabled');
    case 'unconfigured':
      return t('ship.checkUnconfigured');
    default:
      return t('ship.checkFailed');
  }
}

export function ShipPage({
  initial,
  serverNow,
}: {
  initial: ShipRead;
  serverNow: number;
}) {
  const { t, locale } = useI18n();
  const now = useNow(serverNow);
  const client = useQueryClient();
  const [showStale, setShowStale] = useState(false);
  // When the last Check now result arrived; its note shows for a while.
  const [noteAt, setNoteAt] = useState<number | null>(null);
  // Bumped around the fresh read after a check, so a poll that started
  // before it can never replace it.
  const fence = useRef(0);
  const query = useQuery({
    queryKey: SHIP_QUERY_KEY,
    queryFn: async () => {
      const ticket = fence.current;
      const read = await loadShip();
      return ticket === fence.current
        ? read
        : (client.getQueryData<ShipRead>(SHIP_QUERY_KEY) ?? read);
    },
    initialData: initial,
    refetchInterval: REFRESH_MS,
  });
  const check = useMutation({
    mutationFn: () => checkShipNow(),
    // A fresh read, never joined to or replaced by a poll that started
    // before it.
    onSettled: async () => {
      setNoteAt(Date.now());
      fence.current++;
      await client.cancelQueries({ queryKey: SHIP_QUERY_KEY });
      const read = await loadShip({ data: { fresh: true } });
      fence.current++;
      client.setQueryData(SHIP_QUERY_KEY, read);
    },
  });
  const read = query.data;
  // A check result shows until its retry window (or 30 s) has passed.
  const checkNote =
    check.data &&
    noteAt !== null &&
    now - noteAt <
      (check.data.state === 'rate_limited'
        ? (check.data.retryAfterMs ?? CHECK_NOTE_MS)
        : CHECK_NOTE_MS)
      ? checkMessage(t, check.data)
      : null;
  const busy = check.isPending;
  const onCheck = () => check.mutate();
  const snapshot = read.kind === 'ready' ? read.snapshot : null;
  const kind = snapshot ? pageKind(snapshot) : null;
  const lastGood = snapshot ? lastGoodCheck(snapshot) : null;

  const status = busy
    ? t('ship.checking')
    : kind === 'error'
      ? lastGood
        ? t('ship.lastGood', { time: formatTime(locale, lastGood) })
        : null
      : snapshot
        ? nextCheckAt(snapshot) > now
          ? t('ship.checkedNext', {
              age: formatAge(t, now - Date.parse(snapshot.collectedAt)),
              next: formatAge(t, nextCheckAt(snapshot) - now),
            })
          : t('ship.checkedDue', {
              age: formatAge(t, now - Date.parse(snapshot.collectedAt)),
            })
        : null;

  return (
    <Shell footer={null}>
      <PageHeader
        title={t('ship.title')}
        subtitle={t('ship.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs" aria-live="polite">
              {checkNote ?? status}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={onCheck}
              disabled={busy}
            >
              <RefreshCw
                className={cn('size-4', busy && 'animate-spin')}
                aria-hidden
              />
              {t('ship.checkNow')}
            </Button>
            <Preferences />
          </div>
        }
      />
      {read.kind === 'error' ? (
        <LoadError
          reason={read.reason}
          onRetry={() => query.refetch()}
          busy={query.isFetching}
        />
      ) : read.kind === 'uncollected' ? (
        <Card className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <div className="grid size-11 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Rocket className="size-5" aria-hidden />
          </div>
          <div className="font-semibold">{t('ship.empty.title')}</div>
          <p className="max-w-md text-muted-foreground">
            {t('ship.empty.body')}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <SourceStrip snapshot={read.snapshot} now={now} />
          {kind === 'error' ? (
            <ErrorBanner
              lastGood={lastGood}
              now={now}
              onRetry={onCheck}
              busy={busy}
              showingStale={showStale}
              onToggleStale={() => setShowStale((value) => !value)}
            />
          ) : kind === 'partial' ? (
            <PartialBanner
              snapshot={read.snapshot}
              onRetry={onCheck}
              busy={busy}
            />
          ) : null}
          {kind !== 'error' || showStale ? (
            <>
              <ShipStats snapshot={read.snapshot} now={now} />
              <ShipGroups snapshot={read.snapshot} now={now} />
            </>
          ) : null}
        </div>
      )}
    </Shell>
  );
}

/** Fixed-geometry rows while the first read runs; nothing older is shown. */
export function ShipLoading() {
  const { t } = useI18n();
  return (
    <div role="status" aria-label={t('ship.checking')} className="space-y-4">
      <Card className="divide-y">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="grid gap-3 p-4 lg:grid-cols-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </Card>
      <p className="sr-only">{t('ship.loading')}</p>
    </div>
  );
}
