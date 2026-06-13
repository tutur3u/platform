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
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { operatorDialogContentClassName } from './operator-dialog';
import { SelectField, SelectValueField } from './operator-form-fields';
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
  const [open, setOpen] = useState(false);
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
      setTargetId('');
      setOpen(false);
      toast.success(t('saveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });
  const canCreate =
    Boolean(activeStorefrontId && targetId && title) &&
    (listingType === 'bundle' ||
      Boolean(activeInventory.unit_id && activeInventory.warehouse_id));

  if (storefronts.length === 0) {
    return (
      <EmptyRow
        description={t('noStorefrontsForListings')}
        label={t('emptyResource')}
      />
    );
  }

  return (
    <section className="grid gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SelectField
          allowEmpty={false}
          className="min-w-0 flex-1"
          emptyText={t('emptyOptions')}
          label={t('storefront')}
          onChange={setStorefrontId}
          options={storefronts}
          placeholder={t('placeholders.storefront')}
          searchPlaceholder={t('searchOptions', {
            resource: t('storefront'),
          })}
          value={activeStorefrontId}
        />
        <Dialog onOpenChange={setOpen} open={open}>
          <DialogTrigger asChild>
            <Button type="button" variant="secondary">
              <Plus className="h-4 w-4" />
              {t('newListing')}
            </Button>
          </DialogTrigger>
          <DialogContent className={operatorDialogContentClassName('medium')}>
            <DialogHeader>
              <DialogTitle>{t('createListingTitle')}</DialogTitle>
              <DialogDescription>
                {t('createListingDescription')}
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-3"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                if (canCreate) createMutation.mutate();
              }}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <SelectValueField
                  allowEmpty={false}
                  emptyText={t('emptyOptions')}
                  label={t('listingType')}
                  onChange={(value) => {
                    setListingType(value as 'product' | 'bundle');
                    setTargetId('');
                  }}
                  options={[
                    { label: t('product'), value: 'product' },
                    { label: t('bundle'), value: 'bundle' },
                  ]}
                  placeholder={t('placeholders.listingType')}
                  searchPlaceholder={t('searchOptions', {
                    resource: t('listingType'),
                  })}
                  value={listingType}
                />
                <SelectField
                  emptyText={t('emptyOptions')}
                  label={t('target')}
                  onChange={setTargetId}
                  options={listingType === 'product' ? products : bundles}
                  placeholder={t('placeholders.target')}
                  searchPlaceholder={t('searchOptions', {
                    resource: t('target'),
                  })}
                  value={targetId}
                />
                <label className="grid min-w-0 gap-1 text-sm">
                  <span className="font-medium">{t('listingTitle')}</span>
                  <Input
                    className="h-10"
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={t('placeholders.listingTitle')}
                    value={title}
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-sm">
                  <span className="font-medium">{t('price')}</span>
                  <Input
                    className="h-10"
                    inputMode="numeric"
                    onChange={(event) => setPrice(event.target.value)}
                    placeholder={t('placeholders.price')}
                    value={price}
                  />
                </label>
              </div>
              <DialogFooter>
                <Button
                  disabled={!canCreate || createMutation.isPending}
                  type="submit"
                >
                  {createMutation.isPending ? t('creating') : t('create')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {listings.isPending ? <LoadingRows /> : null}
      {listings.data?.data.length === 0 ? (
        <EmptyRow label={t('emptyResource')} />
      ) : null}
      <div className="grid gap-2">
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
    <div className="grid min-w-0 gap-2 rounded-md border border-border bg-background p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium">{listing.title}</p>
        <p className="truncate text-muted-foreground text-xs">
          {listing.status}
        </p>
      </div>
      <span>{currency(listing.price)}</span>
      <Button
        onClick={() => archiveMutation.mutate()}
        size="icon"
        type="button"
        variant="outline"
      >
        <Archive className="h-4 w-4" />
      </Button>
      <Button
        onClick={() => deleteMutation.mutate()}
        size="icon"
        type="button"
        variant="destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
