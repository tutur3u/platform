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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { currency } from './operator-format';
import { EmptyRow, LoadingRows } from './operator-shell';

const EMPTY_SELECT_VALUE = '__inventory_empty__';

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
        <label className="grid min-w-0 flex-1 gap-1 text-sm">
          <span className="font-medium">{t('storefront')}</span>
          <Select onValueChange={setStorefrontId} value={activeStorefrontId}>
            <SelectTrigger className="h-10 min-w-0">
              <SelectValue placeholder={t('placeholders.storefront')} />
            </SelectTrigger>
            <SelectContent>
              {storefronts.map((storefront) => (
                <SelectItem key={storefront.id} value={storefront.id}>
                  {storefront.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <Dialog onOpenChange={setOpen} open={open}>
          <DialogTrigger asChild>
            <Button type="button" variant="secondary">
              <Plus className="h-4 w-4" />
              {t('newListing')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-2rem),42rem)] overflow-y-auto">
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
                <label className="grid min-w-0 gap-1 text-sm">
                  <span className="font-medium">{t('product')}</span>
                  <Select
                    onValueChange={(value) => {
                      setListingType(value as 'product' | 'bundle');
                      setTargetId('');
                    }}
                    value={listingType}
                  >
                    <SelectTrigger className="h-10 min-w-0">
                      <SelectValue
                        placeholder={t('placeholders.listingType')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="product">{t('product')}</SelectItem>
                      <SelectItem value="bundle">{t('bundle')}</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid min-w-0 gap-1 text-sm">
                  <span className="font-medium">{t('target')}</span>
                  <Select
                    onValueChange={(value) =>
                      setTargetId(value === EMPTY_SELECT_VALUE ? '' : value)
                    }
                    value={targetId || EMPTY_SELECT_VALUE}
                  >
                    <SelectTrigger className="h-10 min-w-0">
                      <SelectValue placeholder={t('placeholders.target')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_SELECT_VALUE}>
                        {t('placeholders.target')}
                      </SelectItem>
                      {(listingType === 'product' ? products : bundles).map(
                        (item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </label>
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
    <div className="grid gap-2 rounded-md border border-border bg-background p-3 text-sm sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
      <div>
        <p className="font-medium">{listing.title}</p>
        <p className="text-muted-foreground text-xs">{listing.status}</p>
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
