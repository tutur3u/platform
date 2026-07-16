'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CircleDot,
  PackageSearch,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from '@tuturuuu/icons';
import {
  getInventorySquareCatalogSyncState,
  getInventorySquareSettings,
} from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { CompactEditButton } from './payment-read-only-fields';
import { SquareCatalogSyncCard } from './square-catalog-sync-card';

const LINK_TONES = {
  active: 'border-dynamic-green/35 bg-dynamic-green/10 text-dynamic-green',
  conflict: 'border-dynamic-orange/35 bg-dynamic-orange/10 text-dynamic-orange',
  error: 'border-destructive/35 bg-destructive/10 text-destructive',
  remote_deleted:
    'border-dynamic-orange/35 bg-dynamic-orange/10 text-dynamic-orange',
} as const;

export function SquareSyncObservabilityPanel({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator.squareObservability');
  const locale = useLocale();
  const [actionsEnabled, setActionsEnabled] = useState(false);
  const settings = useQuery({
    queryFn: () => getInventorySquareSettings(wsId),
    queryKey: ['inventory', wsId, 'square-settings'],
  });
  const syncState = useQuery({
    queryFn: () => getInventorySquareCatalogSyncState(wsId),
    queryKey: ['inventory', wsId, 'square-catalog-sync'],
  });
  const state = syncState.data;
  const links = state?.links ?? [];
  const activeEnvironment =
    state?.environment ?? settings.data?.environment ?? 'sandbox';
  const connected = (settings.data?.connections ?? []).some(
    (connection) =>
      connection.environment === activeEnvironment &&
      connection.status === 'ready'
  );
  const formattedDate = state?.updatedAt
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(state.updatedAt))
    : null;

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex max-w-3xl items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-primary/10 text-primary">
            <PackageSearch className="size-4" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-lg">{t('title')}</h3>
              <Badge variant="outline">
                {t(`environment.${activeEnvironment}`)}
              </Badge>
            </div>
            <p className="mt-1 text-muted-foreground text-sm leading-6">
              {t('description')}
            </p>
          </div>
        </div>
        <CompactEditButton
          editing={actionsEnabled}
          label={actionsEnabled ? t('lockActions') : t('enableActions')}
          onClick={() => setActionsEnabled((value) => !value)}
        />
      </div>

      <SquareCatalogSyncCard
        actionsEnabled={actionsEnabled}
        connected={connected}
        wsId={wsId}
      />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-border border-b p-5">
          <div>
            <h3 className="font-semibold">{t('linkedTitle')}</h3>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('linkedDescription', { count: links.length })}
            </p>
          </div>
          <div className="text-right text-muted-foreground text-xs">
            <p>
              {formattedDate
                ? t('observedAt', { date: formattedDate })
                : t('never')}
            </p>
            <p className="mt-1 font-mono">
              {t('linkedRows', { count: links.length })}
            </p>
          </div>
        </div>

        {syncState.isPending ? (
          <div className="grid gap-2 p-4">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        ) : links.length === 0 ? (
          <div className="grid place-items-center gap-2 px-5 py-12 text-center">
            <RefreshCw className="size-5 text-muted-foreground" />
            <p className="font-medium text-sm">{t('emptyTitle')}</p>
            <p className="max-w-lg text-muted-foreground text-xs leading-5">
              {t('emptyDescription', {
                environment: t(`environmentName.${activeEnvironment}`),
              })}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {links.map((link) => (
              <div
                className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                key={`${link.squareVariationId}-${link.unitId}-${link.warehouseId}`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <CircleDot className="mt-1 size-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-sm">
                        {link.productName}
                      </p>
                      <Badge
                        className={cn(LINK_TONES[link.status])}
                        variant="outline"
                      >
                        {t(`status.${link.status}`)}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
                      <span>{t('tuturuuu')}</span>
                      <ArrowRight className="size-3" />
                      <span>
                        {link.squareItemName || t('unnamedSquareItem')}
                      </span>
                      {link.squareVariationName ? (
                        <span>· {link.squareVariationName}</span>
                      ) : null}
                      {link.squareSku ? <code>· {link.squareSku}</code> : null}
                      <code>
                        ·{' '}
                        {t('variationId', {
                          id: link.squareVariationId.slice(-10),
                        })}
                      </code>
                    </div>
                    {link.lastError ? (
                      <p className="mt-1 flex items-center gap-1 text-destructive text-xs">
                        <TriangleAlert className="size-3" />
                        {link.lastError}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground text-xs sm:justify-end">
                  <ShieldCheck className="size-3.5 text-dynamic-green" />
                  <span>
                    {t(`origin.${link.syncOrigin}`)}
                    {link.lastSyncedAt
                      ? ` · ${new Intl.DateTimeFormat(locale, {
                          dateStyle: 'medium',
                        }).format(new Date(link.lastSyncedAt))}`
                      : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-border border-t bg-muted/20 px-5 py-3 text-muted-foreground text-xs leading-5">
          {t('countExplanation')}
        </div>
      </div>
    </section>
  );
}
