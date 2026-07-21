'use client';

import { Search } from '@tuturuuu/icons';
import type { InventoryStorefrontListing } from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { SlotText } from 'slot-text/react';
import { Button } from '../button';
import { Input } from '../input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../tabs';
import type { StorefrontSurfaceLabels } from './types';

type BrowseFilter = 'all' | 'bundle' | 'product';

export function StorefrontBrowsePanel({
  compactLayout,
  emptyListings,
  flushTop = false,
  labels,
  listings,
  renderListing,
}: {
  compactLayout: boolean;
  emptyListings: ReactNode;
  flushTop?: boolean;
  labels: StorefrontSurfaceLabels;
  listings: InventoryStorefrontListing[];
  renderListing: (listing: InventoryStorefrontListing) => ReactNode;
}) {
  const [filter, setFilter] = useState<BrowseFilter>('all');
  const [query, setQuery] = useState('');
  const visibleListings = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return listings.filter((listing) => {
      if (filter !== 'all' && listing.listingType !== filter) return false;
      if (!normalizedQuery) return true;

      return [listing.title, listing.description]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [filter, listings, query]);
  const resultLabel = labels.visibleItems.replace(
    '{count}',
    String(visibleListings.length)
  );
  const hasActiveFilters = filter !== 'all' || query.trim().length > 0;

  return (
    <section
      aria-labelledby="storefront-shop-heading"
      className={flushTop ? undefined : 'mt-10'}
    >
      <div className="flex flex-col gap-5 border-border border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.16em]">
            {labels.browse}
          </p>
          <h2
            className="mt-2 font-semibold text-2xl tracking-tight"
            id="storefront-shop-heading"
          >
            {labels.shopTitle}
          </h2>
        </div>
        {listings.length ? (
          <div className="grid gap-3 sm:grid-cols-[minmax(14rem,20rem)_auto] sm:items-center">
            <label className="relative block">
              <span className="sr-only">{labels.searchStore}</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 rounded-lg border-border bg-background pl-9 shadow-none"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={labels.searchStore}
                type="search"
                value={query}
              />
            </label>
            <Tabs
              onValueChange={(value) => setFilter(value as BrowseFilter)}
              value={filter}
            >
              <TabsList className="grid h-10 w-full grid-cols-3 rounded-lg bg-muted/60 sm:w-auto">
                <TabsTrigger onClick={() => setFilter('all')} value="all">
                  {labels.allItems}
                </TabsTrigger>
                <TabsTrigger
                  onClick={() => setFilter('product')}
                  value="product"
                >
                  {labels.products}
                </TabsTrigger>
                <TabsTrigger onClick={() => setFilter('bundle')} value="bundle">
                  {labels.bundles}
                </TabsTrigger>
              </TabsList>
              <TabsContent className="sr-only" forceMount value="all">
                {labels.allItems}
              </TabsContent>
              <TabsContent className="sr-only" forceMount value="product">
                {labels.products}
              </TabsContent>
              <TabsContent className="sr-only" forceMount value="bundle">
                {labels.bundles}
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </div>

      <div className="sr-only" role="status">
        {resultLabel}
      </div>
      <div
        aria-hidden
        className="mt-4 h-5 font-mono text-muted-foreground text-xs"
      >
        <SlotText
          options={{ bounce: 0.12, duration: 220, stagger: 18 }}
          text={resultLabel}
        />
      </div>

      {listings.length === 0 ? (
        <div className="mt-5">{emptyListings}</div>
      ) : visibleListings.length === 0 ? (
        <div className="mt-5 grid min-h-64 place-items-center rounded-xl border border-border border-dashed bg-muted/15 p-8 text-center">
          <div className="max-w-sm">
            <Search className="mx-auto size-5 text-muted-foreground" />
            <h3 className="mt-4 font-semibold text-lg">
              {labels.noResultsTitle}
            </h3>
            <p className="mt-2 text-muted-foreground text-sm leading-6">
              {labels.noResultsDescription}
            </p>
            {hasActiveFilters ? (
              <Button
                className="mt-4"
                onClick={() => {
                  setFilter('all');
                  setQuery('');
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {labels.clearFilters}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'mt-5 grid gap-5',
            compactLayout ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'
          )}
        >
          {visibleListings.map(renderListing)}
        </div>
      )}
    </section>
  );
}
