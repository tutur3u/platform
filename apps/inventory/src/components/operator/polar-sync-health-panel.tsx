'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Clock, RefreshCw, TriangleAlert } from '@tuturuuu/icons';
import {
  getInventoryPolarSyncSummary,
  type InventoryPolarSyncStatusCounts,
  syncInventoryPolarProducts,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { PolarSyncItemList } from './polar-sync-item-list';

type StatusKey = 'synced' | 'pending' | 'error' | 'disabled';

const STATUS_META: Record<StatusKey, { Icon: typeof Clock; tone: string }> = {
  disabled: { Icon: Ban, tone: 'text-muted-foreground' },
  error: { Icon: TriangleAlert, tone: 'text-destructive' },
  pending: { Icon: Clock, tone: 'text-dynamic-orange' },
  synced: { Icon: RefreshCw, tone: 'text-dynamic-green' },
};

const STATUS_ORDER: StatusKey[] = ['synced', 'pending', 'error', 'disabled'];

function emptyCounts(): InventoryPolarSyncStatusCounts {
  return { disabled: 0, error: 0, pending: 0, synced: 0, total: 0 };
}

export function PolarSyncHealthPanel({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator.polar');
  const locale = useLocale();
  const queryClient = useQueryClient();

  const summary = useQuery({
    queryFn: () => getInventoryPolarSyncSummary(wsId),
    queryKey: ['inventory', wsId, 'polar-sync-summary'],
  });
  const resync = useMutation({
    mutationFn: () => syncInventoryPolarProducts(wsId),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('saveError')),
    onSuccess: (result) => {
      toast.success(
        t('sync.resyncDone', {
          count: result.synced.listings + result.synced.bundles,
        })
      );
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'polar-sync-summary'],
      });
    },
  });

  const data = summary.data;
  const lastSynced =
    data?.lastSyncedAt &&
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(data.lastSyncedAt));

  const renderChips = (
    counts: InventoryPolarSyncStatusCounts,
    label: string
  ) => (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">
        {label} · {counts.total}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {STATUS_ORDER.map((key) => {
          const { Icon, tone } = STATUS_META[key];
          return (
            <span
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs tabular-nums"
              key={key}
            >
              <Icon className={cn('h-3 w-3', tone)} />
              <span className="font-medium">{counts[key]}</span>
              <span className="text-muted-foreground">
                {t(`sync.status.${key}`)}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );

  return (
    <section className="grid min-w-0 gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm">{t('sync.title')}</h3>
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            {t('sync.description')}
          </p>
        </div>
        <Button
          disabled={resync.isPending}
          onClick={() => resync.mutate()}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw
            className={cn('h-4 w-4', resync.isPending && 'animate-spin')}
          />
          {resync.isPending ? t('sync.resyncing') : t('sync.resync')}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {summary.isPending ? (
          <>
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </>
        ) : (
          <>
            {renderChips(data?.listings ?? emptyCounts(), t('sync.listings'))}
            {renderChips(data?.bundles ?? emptyCounts(), t('sync.bundles'))}
          </>
        )}
      </div>

      {summary.isError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-destructive text-xs">
          <span>{t('sync.loadError')}</span>
          <Button
            onClick={() => summary.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            {t('sync.retry')}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          {t('sync.lastSynced')}: {lastSynced || t('sync.never')}
        </p>
      )}

      {data ? <PolarSyncItemList items={data.items ?? []} /> : null}

      {data && data.errors.length > 0 ? (
        <div className="grid gap-1.5">
          <p className="font-medium text-xs">{t('sync.errorsTitle')}</p>
          {data.errors.map((item) => (
            <div
              className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-destructive text-xs"
              key={`${item.kind}-${item.name}`}
            >
              <span className="font-medium">{item.name}</span> — {item.error}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
