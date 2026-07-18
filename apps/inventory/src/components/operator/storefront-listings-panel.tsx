'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackagePlus, Plus, Sparkles } from '@tuturuuu/icons';
import type {
  InventoryBundle,
  InventoryProductSummary,
  InventoryStorefront,
} from '@tuturuuu/internal-api/inventory';
import {
  bulkImportInventoryStorefrontListings,
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
import { money } from './operator-format';
import { EmptyRow, LoadingRows } from './operator-shell';
import {
  getPreferredListingStock,
  getStockPriceMinor,
} from './storefront-listing-pricing';
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
  const [bulkOpen, setBulkOpen] = useState(false);
  const activeStorefrontId = resolveActiveStorefrontId(
    storefronts,
    storefrontId
  );
  const activeCurrency =
    storefronts.find((storefront) => storefront.id === activeStorefrontId)
      ?.currency ?? 'USD';
  const activeProduct = products.find((product) => product.id === targetId);
  const activeInventory = getPreferredListingStock(activeProduct);
  const stockPrice = getStockPriceMinor(activeProduct, activeCurrency);
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
          listingType === 'product' ? (activeInventory?.unitId ?? null) : null,
        warehouseId:
          listingType === 'product'
            ? (activeInventory?.warehouseId ?? null)
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
  const bulkMutation = useMutation({
    mutationFn: () =>
      bulkImportInventoryStorefrontListings(wsId, activeStorefrontId),
    onError: () => toast.error(t('bulkListingImport.error')),
    onSuccess: ({ data }) => {
      toast.success(t('bulkListingImport.success', { count: data.created }));
      setBulkOpen(false);
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });
  const canCreate =
    Boolean(activeStorefrontId && targetId && title) &&
    (listingType === 'bundle' ||
      Boolean(activeInventory?.unitId && activeInventory.warehouseId));

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
        <div className="flex flex-wrap gap-2">
          <Dialog onOpenChange={setBulkOpen} open={bulkOpen}>
            <DialogTrigger asChild>
              <Button
                disabled={!activeStorefrontId}
                type="button"
                variant="outline"
              >
                <PackagePlus className="h-4 w-4" />
                {t('bulkListingImport.trigger')}
              </Button>
            </DialogTrigger>
            <OperatorDialogContent size="sm">
              <OperatorDialogHeader
                description={t('bulkListingImport.description')}
                title={t('bulkListingImport.title')}
              />
              <OperatorDialogBody className="grid gap-3">
                <div className="rounded-lg border bg-muted/25 p-4">
                  <p className="flex items-center gap-2 font-medium text-sm">
                    <Sparkles className="h-4 w-4 text-primary" />
                    {t('bulkListingImport.safeTitle')}
                  </p>
                  <p className="mt-2 text-muted-foreground text-sm leading-6">
                    {t('bulkListingImport.safeDescription')}
                  </p>
                </div>
              </OperatorDialogBody>
              <OperatorDialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost">
                    {t('cancel')}
                  </Button>
                </DialogClose>
                <Button
                  disabled={bulkMutation.isPending}
                  onClick={() => bulkMutation.mutate()}
                  type="button"
                >
                  <PackagePlus className="h-4 w-4" />
                  {bulkMutation.isPending
                    ? t('bulkListingImport.importing')
                    : t('bulkListingImport.confirm')}
                </Button>
              </OperatorDialogFooter>
            </OperatorDialogContent>
          </Dialog>
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
                        setTitle('');
                        setPrice(0);
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
                      onChange={(value) => {
                        setTargetId(value);
                        const product = products.find(
                          (item) => item.id === value
                        );
                        const bundle = bundles.find(
                          (item) => item.id === value
                        );
                        setTitle(product?.name ?? bundle?.name ?? '');
                        if (listingType === 'product' && product) {
                          setPrice(
                            getStockPriceMinor(product, activeCurrency) ?? 0
                          );
                        }
                      }}
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
                    {listingType === 'product' && activeInventory ? (
                      <div className="rounded-lg border bg-muted/20 p-3 text-sm md:col-span-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-muted-foreground">
                            {t('stockPriceSuggestion')}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-medium tabular-nums">
                              {stockPrice === null
                                ? '—'
                                : money(stockPrice, activeCurrency)}
                            </span>
                            {stockPrice !== null && price !== stockPrice ? (
                              <Button
                                onClick={() => setPrice(stockPrice)}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                {t('useStockPrice')}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
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
