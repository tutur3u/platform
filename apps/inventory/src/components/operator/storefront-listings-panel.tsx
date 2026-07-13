'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from '@tuturuuu/icons';
import type {
  InventoryBundle,
  InventoryProductSummary,
  InventoryStorefront,
} from '@tuturuuu/internal-api/inventory';
import {
  createInventoryStorefrontListing,
  listInventoryStorefrontListings,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { MoneyInput } from '@tuturuuu/ui/money-input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { type FormEvent, useState } from 'react';
import {
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';
import { SelectField, SelectValueField } from './operator-form-fields';
import { EmptyRow, LoadingRows } from './operator-shell';
import { ListingRow } from './storefront-listing-row';
import { resolveActiveStorefrontId } from './storefront-selection';

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
  const [storefrontId, setStorefrontId] = useQueryState(
    'storefront',
    parseAsString.withOptions({ shallow: true })
  );
  const [listingType, setListingType] = useState<'product' | 'bundle'>(
    'product'
  );
  const [targetId, setTargetId] = useState('');
  const [title, setTitle] = useState('');
  // Price is held in integer minor units (cents) — the canonical storage unit.
  const [price, setPrice] = useState(0);
  const [open, setOpen] = useState(false);
  const activeStorefrontId = resolveActiveStorefrontId(
    storefronts,
    storefrontId
  );
  const activeCurrency =
    storefronts.find((storefront) => storefront.id === activeStorefrontId)
      ?.currency ?? 'USD';
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
        price,
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
      setPrice(0);
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
          onChange={(value) => void setStorefrontId(value)}
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
          <OperatorDialogContent size="md">
            <OperatorDialogHeader
              description={t('createListingDescription')}
              title={t('createListingTitle')}
            />
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                if (canCreate) createMutation.mutate();
              }}
            >
              <OperatorDialogBody className="grid gap-6">
                <div className="grid gap-3 md:grid-cols-2">
                  <SelectValueField
                    allowEmpty={false}
                    emptyText={t('emptyOptions')}
                    hint={t('hints.listingType')}
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
                    <MoneyInput
                      className="h-10"
                      currency={activeCurrency}
                      hideHelpers
                      onChange={setPrice}
                      placeholder={t('placeholders.price')}
                      value={price}
                    />
                  </label>
                </div>
              </OperatorDialogBody>
              <OperatorDialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost">
                    {t('cancel')}
                  </Button>
                </DialogClose>
                <Button
                  disabled={!canCreate || createMutation.isPending}
                  type="submit"
                >
                  {createMutation.isPending ? t('creating') : t('create')}
                </Button>
              </OperatorDialogFooter>
            </form>
          </OperatorDialogContent>
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
            currency={activeCurrency}
            listing={listing}
            products={products}
            storefrontId={activeStorefrontId}
            wsId={wsId}
          />
        ))}
      </div>
    </section>
  );
}
