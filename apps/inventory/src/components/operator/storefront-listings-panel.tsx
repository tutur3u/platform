'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Plus, Trash2 } from '@tuturuuu/icons';
import type {
  InventoryBundle,
  InventoryProductSummary,
  InventoryStorefront,
} from '@tuturuuu/internal-api/inventory';
import {
  createInventoryStorefrontListing,
  deleteInventoryStorefrontListing,
  listInventoryStorefrontListings,
  updateInventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { currency } from './operator-format';
import { EmptyRow, LoadingRows } from './operator-shell';

export function StorefrontListingsPanel({
  bundles,
  products,
  storefronts,
  wsId,
}: {
  bundles: InventoryBundle[];
  products: InventoryProductSummary[];
  storefronts: InventoryStorefront[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [storefrontId, setStorefrontId] = useState('');
  const [listingType, setListingType] = useState<'product' | 'bundle'>(
    'product'
  );
  const [targetId, setTargetId] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const activeStorefrontId = storefrontId || storefronts[0]?.id || '';
  const activeProduct = products.find((product) => product.id === targetId);
  const activeInventory = activeProduct?.inventory?.[0] ?? {};
  const listings = useQuery({
    enabled: Boolean(activeStorefrontId),
    queryFn: () =>
      listInventoryStorefrontListings(wsId, activeStorefrontId, {
        status: 'all',
      }),
    queryKey: ['inventory', wsId, 'storefront-listings', activeStorefrontId],
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createInventoryStorefrontListing(wsId, activeStorefrontId, {
        bundleId: listingType === 'bundle' ? targetId : null,
        listingType,
        price: Number(price || 0),
        productId: listingType === 'product' ? targetId : null,
        status: 'draft',
        title,
        unitId:
          listingType === 'product'
            ? String(activeInventory.unit_id ?? '')
            : null,
        warehouseId:
          listingType === 'product'
            ? String(activeInventory.warehouse_id ?? '')
            : null,
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      setTitle('');
      setPrice('');
      toast.success(t('saveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });
  const canCreate =
    Boolean(activeStorefrontId && targetId && title) &&
    (listingType === 'bundle' ||
      Boolean(activeInventory.unit_id && activeInventory.warehouse_id));

  return (
    <section className="border-border border-t">
      <form
        className="grid gap-2 p-3 lg:grid-cols-[1fr_120px_1fr_1fr_120px_auto]"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (canCreate) createMutation.mutate();
        }}
      >
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          onChange={(event) => setStorefrontId(event.target.value)}
          value={activeStorefrontId}
        >
          {storefronts.map((storefront) => (
            <option key={storefront.id} value={storefront.id}>
              {storefront.name}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          onChange={(event) => {
            setListingType(event.target.value as 'product' | 'bundle');
            setTargetId('');
          }}
          value={listingType}
        >
          <option value="product">{t('product')}</option>
          <option value="bundle">{t('bundle')}</option>
        </select>
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          onChange={(event) => setTargetId(event.target.value)}
          value={targetId}
        >
          <option value="">{t('target')}</option>
          {(listingType === 'product' ? products : bundles).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <input
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('listingTitle')}
          value={title}
        />
        <input
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          inputMode="numeric"
          onChange={(event) => setPrice(event.target.value)}
          placeholder={t('price')}
          value={price}
        />
        <button
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-dynamic-blue px-3 font-medium text-dynamic-blue-foreground text-sm disabled:opacity-50"
          disabled={!canCreate || createMutation.isPending}
          type="submit"
        >
          <Plus className="h-4 w-4" />
          {t('create')}
        </button>
      </form>
      {listings.isPending ? <LoadingRows /> : null}
      {listings.data?.data.length === 0 ? (
        <EmptyRow label={t('emptyResource')} />
      ) : null}
      <div className="divide-y divide-border">
        {listings.data?.data.map((listing) => (
          <ListingRow
            key={listing.id}
            listing={listing}
            storefrontId={activeStorefrontId}
            wsId={wsId}
          />
        ))}
      </div>
    </section>
  );
}

function ListingRow({
  listing,
  storefrontId,
  wsId,
}: {
  listing: { id: string; price: number; status: string; title: string };
  storefrontId: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const archiveMutation = useMutation({
    mutationFn: () =>
      updateInventoryStorefrontListing(wsId, storefrontId, listing.id, {
        status: 'archived',
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () =>
      deleteInventoryStorefrontListing(wsId, storefrontId, listing.id),
    onError: () => toast.error(t('deleteError')),
    onSuccess: () => {
      toast.success(t('deleteSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });

  return (
    <div className="grid gap-2 p-3 text-sm sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
      <div>
        <p className="font-medium">{listing.title}</p>
        <p className="text-muted-foreground text-xs">{listing.status}</p>
      </div>
      <span>{currency(listing.price)}</span>
      <button
        className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2"
        onClick={() => archiveMutation.mutate()}
        type="button"
      >
        <Archive className="h-4 w-4" />
      </button>
      <button
        className="inline-flex h-8 items-center justify-center rounded-md border border-dynamic-red/30 px-2 text-dynamic-red"
        onClick={() => deleteMutation.mutate()}
        type="button"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
