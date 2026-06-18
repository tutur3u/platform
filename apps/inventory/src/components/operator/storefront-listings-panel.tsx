'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Clock,
  Eye,
  EyeOff,
  ListTree,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  TriangleAlert,
} from '@tuturuuu/icons';
import type {
  InventoryBundle,
  InventoryListingStatus,
  InventoryProductSummary,
  InventoryStorefront,
  InventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';
import {
  createInventoryOptionTemplate,
  createInventoryStorefrontListing,
  deleteInventoryStorefrontListing,
  listInventoryOptionTemplates,
  listInventoryStorefrontListings,
  updateInventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { MoneyInput } from '@tuturuuu/ui/money-input';
import { toast } from '@tuturuuu/ui/sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import {
  FormSection,
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';
import { SelectField, SelectValueField } from './operator-form-fields';
import { money } from './operator-format';
import { LifecyclePanel } from './operator-lifecycle';
import { EmptyRow, LoadingRows } from './operator-shell';
import {
  buildOptionsVariantsPayload,
  type OptionGroupDraft,
  StorefrontListingOptionsEditor,
  type VariantDraft,
} from './storefront-listing-options-editor';

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
  // Price is held in integer minor units (cents) — the canonical storage unit.
  const [price, setPrice] = useState(0);
  const [open, setOpen] = useState(false);
  const activeStorefrontId = storefrontId || storefronts[0]?.id || '';
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

const SYNC_BADGE_META: Record<string, { Icon: typeof Clock; tone: string }> = {
  disabled: { Icon: Ban, tone: 'text-muted-foreground' },
  error: { Icon: TriangleAlert, tone: 'text-destructive' },
  pending: { Icon: Clock, tone: 'text-dynamic-orange' },
  synced: { Icon: RefreshCw, tone: 'text-dynamic-green' },
};

function ListingSyncBadge({
  error,
  status,
  syncedAt,
}: {
  error?: string | null;
  status?: string | null;
  syncedAt?: string | null;
}) {
  const t = useTranslations('inventory.operator.polar.sync');
  const locale = useLocale();
  const meta = status ? SYNC_BADGE_META[status] : undefined;
  if (!status || !meta) return null;
  const Icon = meta.Icon;
  const formattedSyncedAt =
    syncedAt &&
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(syncedAt));
  const tip =
    status === 'error' && error
      ? error
      : formattedSyncedAt
        ? `${t('lastSynced')}: ${formattedSyncedAt}`
        : t(`status.${status}`);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex h-6 w-fit items-center gap-1 rounded-md border border-border px-2 text-xs">
            <Icon className={cn('h-3 w-3', meta.tone)} />
            {t(`status.${status}`)}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ListingRow({
  currency,
  listing,
  products,
  storefrontId,
  wsId,
}: {
  currency: string;
  listing: InventoryStorefrontListing;
  products: InventoryProductSummary[];
  storefrontId: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const variantCount = (listing.variants ?? []).filter(
    (variant) => variant.status === 'active'
  ).length;
  const isPublished = listing.status === 'published';
  const toggleMutation = useMutation({
    mutationFn: () =>
      updateInventoryStorefrontListing(wsId, storefrontId, listing.id, {
        status: isPublished ? 'paused' : 'published',
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });
  return (
    <div className="grid min-w-0 gap-2 rounded-md border border-border bg-background p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium">{listing.title}</p>
        <p className="truncate text-muted-foreground text-xs">
          {listing.status}
          {variantCount > 0
            ? ` · ${t('variantCount', { count: variantCount })}`
            : ''}
        </p>
      </div>
      <ListingSyncBadge
        error={listing.polarLastError}
        status={listing.polarSyncStatus}
        syncedAt={listing.polarSyncedAt}
      />
      <span>{money(listing.price, currency)}</span>
      <Button
        aria-label={isPublished ? t('pauseListing') : t('publishListing')}
        disabled={toggleMutation.isPending}
        onClick={() => toggleMutation.mutate()}
        size="sm"
        type="button"
        variant="ghost"
      >
        {isPublished ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
        {isPublished ? t('pauseListing') : t('publishListing')}
      </Button>
      <ListingEditorDialog
        currency={currency}
        listing={listing}
        products={products}
        storefrontId={storefrontId}
        wsId={wsId}
      />
    </div>
  );
}

function listingToOptionDrafts(
  listing: InventoryStorefrontListing
): OptionGroupDraft[] {
  return (listing.options ?? []).map((group) => ({
    name: group.name,
    values: group.values.map((value) => value.label),
  }));
}

function listingToVariantDrafts(
  listing: InventoryStorefrontListing
): VariantDraft[] {
  const groupNameById = new Map(
    (listing.options ?? []).map((group) => [group.id, group.name])
  );
  return (listing.variants ?? []).map((variant) => {
    const optionValueLabels: Record<string, string> = {};
    for (const optionValue of variant.optionValues) {
      const groupName = groupNameById.get(optionValue.groupId);
      if (groupName) optionValueLabels[groupName] = optionValue.label;
    }
    return {
      id: variant.id,
      optionValueLabels,
      price: variant.price,
      productId: variant.productId,
      sku: variant.sku ?? '',
      status: variant.status,
      title: variant.title ?? '',
    };
  });
}

function ListingEditorDialog({
  currency,
  listing,
  products,
  storefrontId,
  wsId,
}: {
  currency: string;
  listing: InventoryStorefrontListing;
  products: InventoryProductSummary[];
  storefrontId: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(listing.title);
  // Price held in integer minor units (matches the stored listing price).
  const [price, setPrice] = useState(listing.price);
  const [status, setStatus] = useState<string>(listing.status);
  const [options, setOptions] = useState<OptionGroupDraft[]>(() =>
    listingToOptionDrafts(listing)
  );
  const [variants, setVariants] = useState<VariantDraft[]>(() =>
    listingToVariantDrafts(listing)
  );
  const [templateName, setTemplateName] = useState('');
  const templates = useQuery({
    enabled: open,
    queryFn: () => listInventoryOptionTemplates(wsId),
    queryKey: ['inventory', wsId, 'option-templates'],
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    queryClient.invalidateQueries({
      queryKey: ['inventory', wsId, 'storefront-listings', storefrontId],
    });
  };
  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = buildOptionsVariantsPayload(products, options, variants);
      return updateInventoryStorefrontListing(wsId, storefrontId, listing.id, {
        options: payload.options,
        price,
        status: status as InventoryListingStatus,
        title,
        variants: payload.variants,
      });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      invalidate();
    },
  });
  const saveTemplateMutation = useMutation({
    mutationFn: () =>
      createInventoryOptionTemplate(wsId, {
        groups: options
          .map((group) => ({
            name: group.name.trim(),
            values: group.values
              .map((label) => label.trim())
              .filter(Boolean)
              .map((label) => ({ label })),
          }))
          .filter((group) => group.name && group.values.length > 0),
        name: templateName.trim(),
      }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('saveError')),
    onSuccess: () => {
      setTemplateName('');
      toast.success(t('saveSuccess'));
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'option-templates'],
      });
    },
  });
  const applyTemplate = (templateId: string) => {
    const template = templates.data?.data.find(
      (item) => item.id === templateId
    );
    if (!template) return;
    setOptions(
      template.groups.map((group) => ({
        name: group.name,
        values: group.values.map((value) => value.label),
      }))
    );
  };
  const archiveMutation = useMutation({
    mutationFn: () =>
      updateInventoryStorefrontListing(wsId, storefrontId, listing.id, {
        status: 'archived',
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      setOpen(false);
      invalidate();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () =>
      deleteInventoryStorefrontListing(wsId, storefrontId, listing.id),
    onError: () => toast.error(t('deleteError')),
    onSuccess: () => {
      toast.success(t('deleteSuccess'));
      setOpen(false);
      invalidate();
    },
  });

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setTitle(listing.title);
          setPrice(listing.price);
          setStatus(listing.status);
          setOptions(listingToOptionDrafts(listing));
          setVariants(listingToVariantDrafts(listing));
        }
        setOpen(nextOpen);
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <Pencil className="h-4 w-4" />
          {t('edit')}
        </Button>
      </DialogTrigger>
      <OperatorDialogContent size="md">
        <OperatorDialogHeader
          description={t('editListingDescription')}
          title={t('editListingTitle')}
        />
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (title) saveMutation.mutate();
          }}
        >
          <OperatorDialogBody className="grid gap-6">
            <FormSection
              icon={<ListTree className="h-4 w-4" />}
              title={t('tabs.details')}
            >
              <div className="grid min-w-0 gap-3">
                <label className="grid min-w-0 gap-1 text-sm">
                  <span className="font-medium">{t('listingTitle')}</span>
                  <Input
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={t('placeholders.listingTitle')}
                    value={title}
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-sm">
                  <span className="font-medium">{t('price')}</span>
                  <MoneyInput
                    currency={currency}
                    hideHelpers
                    onChange={setPrice}
                    placeholder={t('placeholders.price')}
                    value={price}
                  />
                </label>
                <SelectValueField
                  allowEmpty={false}
                  label={t('status')}
                  onChange={setStatus}
                  options={[
                    { label: t('listingStatus.draft'), value: 'draft' },
                    { label: t('listingStatus.published'), value: 'published' },
                    { label: t('listingStatus.paused'), value: 'paused' },
                    { label: t('listingStatus.archived'), value: 'archived' },
                  ]}
                  placeholder={t('placeholders.status')}
                  value={status}
                />
              </div>
            </FormSection>
            {listing.listingType === 'product' ? (
              <FormSection
                icon={<ListTree className="h-4 w-4" />}
                title={t('variantsAndOptions')}
              >
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <SelectValueField
                      allowEmpty
                      className="min-w-48"
                      emptyText={t('noTemplates')}
                      label={t('applyTemplate')}
                      onChange={applyTemplate}
                      options={(templates.data?.data ?? []).map((template) => ({
                        label: template.name,
                        value: template.id,
                      }))}
                      placeholder={t('placeholders.applyTemplate')}
                      value=""
                    />
                    <label className="grid min-w-40 flex-1 gap-1 text-sm">
                      <span className="text-xs">{t('templateName')}</span>
                      <Input
                        className="h-9"
                        onChange={(event) =>
                          setTemplateName(event.target.value)
                        }
                        placeholder={t('placeholders.templateName')}
                        value={templateName}
                      />
                    </label>
                    <Button
                      disabled={
                        !templateName.trim() ||
                        options.length === 0 ||
                        saveTemplateMutation.isPending
                      }
                      onClick={() => saveTemplateMutation.mutate()}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      {t('saveAsTemplate')}
                    </Button>
                  </div>
                  <StorefrontListingOptionsEditor
                    currency={currency}
                    onOptionsChange={setOptions}
                    onVariantsChange={setVariants}
                    options={options}
                    products={products}
                    variants={variants}
                  />
                </div>
              </FormSection>
            ) : null}
            <FormSection title={t('tabs.lifecycle')}>
              <LifecyclePanel
                archivePending={archiveMutation.isPending}
                deletePending={deleteMutation.isPending}
                onArchive={() => archiveMutation.mutate()}
                onDelete={() => deleteMutation.mutate()}
                title={t('lifecycle')}
              />
            </FormSection>
          </OperatorDialogBody>
          <OperatorDialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button disabled={!title || saveMutation.isPending} type="submit">
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? t('saving') : t('save')}
            </Button>
          </OperatorDialogFooter>
        </form>
      </OperatorDialogContent>
    </Dialog>
  );
}
