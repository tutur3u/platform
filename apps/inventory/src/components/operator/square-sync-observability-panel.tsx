'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CircleDot,
  Info,
  PackageSearch,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from '@tuturuuu/icons';
import {
  getInventorySquareCatalogSyncState,
  getInventorySquareSettings,
  type InventorySquareCatalogLink,
} from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { SquareCatalogSyncCard } from './square-catalog-sync-card';
import { getSquareLinkPresentation } from './square-link-presentation';
import { SquareLinkReviewDialog } from './square-link-review-dialog';

type LinkFilter = 'all' | 'errors' | 'linked' | 'review';

const LINK_TONES = {
  conflict: 'border-dynamic-orange/35 bg-dynamic-orange/10 text-dynamic-orange',
  linked: 'border-dynamic-green/35 bg-dynamic-green/10 text-dynamic-green',
  price_retry:
    'border-dynamic-orange/35 bg-dynamic-orange/10 text-dynamic-orange',
  remote_deleted:
    'border-dynamic-orange/35 bg-dynamic-orange/10 text-dynamic-orange',
  sync_error: 'border-destructive/35 bg-destructive/10 text-destructive',
} as const;

export function SquareSyncObservabilityPanel({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator.squareObservability');
  const locale = useLocale();
  const [filter, setFilter] = useState<LinkFilter>('all');
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [reviewLink, setReviewLink] =
    useState<InventorySquareCatalogLink | null>(null);
  const settings = useQuery({
    queryFn: () => getInventorySquareSettings(wsId),
    queryKey: ['inventory', wsId, 'square-settings'],
  });
  const syncState = useQuery({
    queryFn: () => getInventorySquareCatalogSyncState(wsId),
    queryKey: ['inventory', wsId, 'square-catalog-sync'],
  });
  const state = syncState.data;
  const priceCapabilityUnavailable =
    state?.lastSummary?.centLevelPricesReady === false;
  const links = state?.links ?? [];
  const presentedLinks = links.map((link) => ({
    link,
    presentation: getSquareLinkPresentation(link),
  }));
  const counts = presentedLinks.reduce(
    (result, { presentation }) => {
      if (presentation.kind === 'linked') result.linked += 1;
      else if (presentation.kind === 'sync_error') result.errors += 1;
      else result.review += 1;
      if (presentation.kind === 'price_retry') result.priceReviews += 1;
      return result;
    },
    { errors: 0, linked: 0, priceReviews: 0, review: 0 }
  );
  const visibleLinks = presentedLinks.filter(({ presentation }) => {
    if (filter === 'all') return true;
    if (filter === 'linked') return presentation.kind === 'linked';
    if (filter === 'errors') return presentation.kind === 'sync_error';
    return !['linked', 'sync_error'].includes(presentation.kind);
  });
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
      </div>

      <SquareCatalogSyncCard
        connected={connected}
        dialogOpen={syncDialogOpen}
        onDialogOpenChange={setSyncDialogOpen}
        wsId={wsId}
      />

      {counts.priceReviews > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dynamic-orange/30 bg-dynamic-orange/5 p-4">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 size-5 shrink-0 text-dynamic-orange" />
            <div>
              <p className="font-semibold text-sm">
                {priceCapabilityUnavailable
                  ? t('priceCapabilitySummaryTitle')
                  : t('priceReviewSummaryTitle', {
                      count: counts.priceReviews,
                    })}
              </p>
              <p className="mt-1 text-muted-foreground text-sm leading-6">
                {priceCapabilityUnavailable
                  ? t('priceCapabilitySummaryDescription')
                  : t('priceReviewSummaryDescription')}
              </p>
            </div>
          </div>
          <Button
            onClick={() => setSyncDialogOpen(true)}
            size="sm"
            type="button"
          >
            <RefreshCw className="size-4" />
            {t('retryExactPrices')}
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid gap-4 border-border border-b p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <h3 className="font-semibold">{t('linkedTitle')}</h3>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('linkedDescription', { count: links.length })}
            </p>
          </div>
          <div className="grid gap-2 lg:justify-items-end">
            <Tabs
              onValueChange={(value) => setFilter(value as LinkFilter)}
              value={filter}
            >
              <TabsList className="grid h-auto grid-cols-4">
                {(['all', 'linked', 'review', 'errors'] as const).map(
                  (item) => (
                    <TabsTrigger className="gap-1.5" key={item} value={item}>
                      {t(`filters.${item}`)}
                      <span className="rounded-full bg-muted-foreground/15 px-1.5 font-mono text-[0.68rem]">
                        {item === 'all' ? links.length : counts[item]}
                      </span>
                    </TabsTrigger>
                  )
                )}
              </TabsList>
            </Tabs>
            <p className="text-muted-foreground text-xs">
              {formattedDate
                ? t('observedAt', { date: formattedDate })
                : t('never')}
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
        ) : visibleLinks.length === 0 ? (
          <div className="grid place-items-center gap-2 px-5 py-10 text-center">
            <ShieldCheck className="size-5 text-dynamic-green" />
            <p className="font-medium text-sm">{t('filterEmpty')}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visibleLinks.map(({ link, presentation }) => (
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
                        className={cn(LINK_TONES[presentation.kind])}
                        variant="outline"
                      >
                        {t(`status.${presentation.kind}`)}
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
                    {presentation.kind === 'price_retry' ? (
                      <p className="mt-1 flex items-center gap-1 text-dynamic-orange text-xs">
                        <Info className="size-3" />
                        {t('priceReviewRow')}
                      </p>
                    ) : link.lastError ? (
                      <p
                        className={cn(
                          'mt-1 flex items-center gap-1 text-xs',
                          presentation.kind === 'sync_error'
                            ? 'text-destructive'
                            : 'text-dynamic-orange'
                        )}
                      >
                        <TriangleAlert className="size-3" />
                        {link.lastError}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs sm:justify-end">
                  {presentation.kind === 'price_retry' ? (
                    <Button
                      onClick={() => setReviewLink(link)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {t('reviewPrice')}
                    </Button>
                  ) : null}
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="size-3.5 text-dynamic-green" />
                    <span>
                      {t(`origin.${link.syncOrigin}`)}
                      {link.lastSyncedAt
                        ? ` · ${new Intl.DateTimeFormat(locale, {
                            dateStyle: 'medium',
                          }).format(new Date(link.lastSyncedAt))}`
                        : ''}
                    </span>
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

      <SquareLinkReviewDialog
        link={reviewLink}
        onManageSync={() => {
          setReviewLink(null);
          setSyncDialogOpen(true);
        }}
        onOpenChange={(open) => !open && setReviewLink(null)}
      />
    </section>
  );
}
