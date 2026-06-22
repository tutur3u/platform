'use client';

import { useQuery } from '@tanstack/react-query';
import { Store } from '@tuturuuu/icons';
import {
  listInventoryProducts,
  listInventoryStorefrontListings,
  listInventoryStorefronts,
} from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { formatMoneyFromMinor } from '@tuturuuu/utils/money';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListingEditorDialog } from './listing-editor-dialog';

const SKELETON_KEYS = ['a', 'b', 'c'];

function StorefrontsAccessDenied() {
  const t = useTranslations();

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h2 className="font-semibold text-lg">
          {t('ws-roles.inventory_access_denied')}
        </h2>
      </div>
    </div>
  );
}

export function StorefrontsClient({
  canViewInventory,
  wsId,
}: {
  canViewInventory: boolean;
  wsId: string;
}) {
  const t = useTranslations('ws-inventory-storefronts');
  const [storefrontId, setStorefrontId] = useState('');

  const storefronts = useQuery({
    enabled: canViewInventory,
    queryFn: () => listInventoryStorefronts(wsId, { status: 'all' }),
    queryKey: ['storefronts', wsId],
  });
  const products = useQuery({
    enabled: canViewInventory,
    queryFn: () => listInventoryProducts(wsId, { pageSize: 100 }),
    queryKey: ['inventory-products', wsId, 'storefront-admin'],
  });

  const activeStorefrontId =
    storefrontId || storefronts.data?.data[0]?.id || '';
  const activeStorefront = storefronts.data?.data.find(
    (storefront) => storefront.id === activeStorefrontId
  );
  const currency = activeStorefront?.currency ?? 'USD';

  const listings = useQuery({
    enabled: canViewInventory && Boolean(activeStorefrontId),
    queryFn: () =>
      listInventoryStorefrontListings(wsId, activeStorefrontId, {
        status: 'all',
      }),
    queryKey: ['storefront-listings', wsId, activeStorefrontId],
  });

  if (!canViewInventory) {
    return <StorefrontsAccessDenied />;
  }

  if (storefronts.isLoading) {
    return (
      <div className="grid gap-3">
        {SKELETON_KEYS.map((key) => (
          <Skeleton className="h-16 w-full" key={key} />
        ))}
      </div>
    );
  }

  if ((storefronts.data?.data.length ?? 0) === 0) {
    return (
      <div className="grid place-items-center rounded-lg border border-border border-dashed p-10 text-center">
        <Store className="size-8 text-muted-foreground" />
        <p className="mt-3 font-semibold">{t('emptyTitle')}</p>
        <p className="mt-1 text-muted-foreground text-sm">
          {t('emptyDescription')}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid min-w-56 gap-1.5">
          <span className="font-medium text-sm">{t('storefront')}</span>
          <Select onValueChange={setStorefrontId} value={activeStorefrontId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {storefronts.data?.data.map((storefront) => (
                <SelectItem key={storefront.id} value={storefront.id}>
                  {storefront.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {listings.isLoading ? (
        <div className="grid gap-2">
          {SKELETON_KEYS.map((key) => (
            <Skeleton className="h-16 w-full" key={key} />
          ))}
        </div>
      ) : (listings.data?.data.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-border border-dashed p-8 text-center text-muted-foreground text-sm">
          {t('noListings')}
        </div>
      ) : (
        <div className="grid gap-2">
          {listings.data?.data.map((listing) => {
            const variantCount = (listing.variants ?? []).filter(
              (variant) => variant.status === 'active'
            ).length;
            return (
              <div
                className="grid min-w-0 items-center gap-2 rounded-md border border-border bg-card p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                key={listing.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{listing.title}</p>
                  <p className="truncate text-muted-foreground text-xs">
                    {listing.status}
                  </p>
                </div>
                {variantCount > 0 ? (
                  <Badge
                    className="border-border bg-background"
                    variant="outline"
                  >
                    {t('variantCount', { count: variantCount })}
                  </Badge>
                ) : (
                  <span />
                )}
                <span className="tabular-nums">
                  {formatMoneyFromMinor(listing.price, currency)}
                </span>
                <ListingEditorDialog
                  currency={currency}
                  listing={listing}
                  products={products.data?.data ?? []}
                  storefrontId={activeStorefrontId}
                  wsId={wsId}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
