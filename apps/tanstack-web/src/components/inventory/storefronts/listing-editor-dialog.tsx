'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from '@tuturuuu/icons';
import {
  createInventoryOptionTemplate,
  type InventoryListingStatus,
  type InventoryProductSummary,
  type InventoryStorefrontListing,
  type InventoryStorefrontListingVariantPayload,
  listInventoryOptionTemplates,
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
import { Label } from '@tuturuuu/ui/label';
import { MoneyInput } from '@tuturuuu/ui/money-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type OptionGroupDraft = { name: string; values: string[] };
type VariantDraft = {
  id?: string;
  sku: string;
  productId: string;
  price: number | null;
  status: 'active' | 'hidden' | 'archived';
  optionValueLabels: Record<string, string>;
};

function resolveCoordinate(
  products: InventoryProductSummary[],
  productId: string
): { unitId: string; warehouseId: string } | null {
  const product = products.find((item) => item.id === productId);
  const inventory = product?.inventory?.[0] as
    | { unit_id?: unknown; warehouse_id?: unknown }
    | undefined;
  const unitId = inventory?.unit_id ? String(inventory.unit_id) : '';
  const warehouseId = inventory?.warehouse_id
    ? String(inventory.warehouse_id)
    : '';
  if (!unitId || !warehouseId) return null;
  return { unitId, warehouseId };
}

function toOptionDrafts(
  listing: InventoryStorefrontListing
): OptionGroupDraft[] {
  return (listing.options ?? []).map((group) => ({
    name: group.name,
    values: group.values.map((value) => value.label),
  }));
}

function toVariantDrafts(listing: InventoryStorefrontListing): VariantDraft[] {
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
    };
  });
}

function buildPayload(
  products: InventoryProductSummary[],
  options: OptionGroupDraft[],
  variants: VariantDraft[]
) {
  const cleanOptions = options
    .map((group) => ({
      name: group.name.trim(),
      values: group.values.map((label) => label.trim()).filter(Boolean),
    }))
    .filter((group) => group.name && group.values.length > 0);
  const payloadVariants: InventoryStorefrontListingVariantPayload[] =
    variants.flatMap((variant, index) => {
      const coordinate = resolveCoordinate(products, variant.productId);
      if (!coordinate) return [];
      const optionValueLabels: Record<string, string> = {};
      for (const group of cleanOptions) {
        const label = variant.optionValueLabels[group.name];
        if (label) optionValueLabels[group.name] = label;
      }
      return [
        {
          id: variant.id,
          optionValueLabels,
          price: variant.price,
          productId: variant.productId,
          sku: variant.sku.trim() || null,
          sortOrder: index,
          status: variant.status,
          unitId: coordinate.unitId,
          warehouseId: coordinate.warehouseId,
        },
      ];
    });
  return {
    options: cleanOptions.map((group, groupIndex) => ({
      name: group.name,
      sortOrder: groupIndex,
      values: group.values.map((label, valueIndex) => ({
        label,
        sortOrder: valueIndex,
      })),
    })),
    variants: payloadVariants,
  };
}

export function ListingEditorDialog({
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
  const t = useTranslations('ws-inventory-storefronts');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(listing.title);
  const [price, setPrice] = useState(listing.price);
  const [status, setStatus] = useState<string>(listing.status);
  const [options, setOptions] = useState<OptionGroupDraft[]>(() =>
    toOptionDrafts(listing)
  );
  const [variants, setVariants] = useState<VariantDraft[]>(() =>
    toVariantDrafts(listing)
  );
  const [templateName, setTemplateName] = useState('');

  const templates = useQuery({
    enabled: open,
    queryFn: () => listInventoryOptionTemplates(wsId),
    queryKey: ['inventory-option-templates', wsId],
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['storefront-listings', wsId, storefrontId],
    });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = buildPayload(products, options, variants);
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
      setOpen(false);
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
      templates.refetch();
    },
  });

  const reset = () => {
    setTitle(listing.title);
    setPrice(listing.price);
    setStatus(listing.status);
    setOptions(toOptionDrafts(listing));
    setVariants(toVariantDrafts(listing));
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (next) reset();
        setOpen(next);
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <Pencil className="h-4 w-4" />
          {t('edit')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('editListing')}</DialogTitle>
          <DialogDescription>{t('editListingDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>{t('listingTitle')}</Label>
              <Input
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t('price')}</Label>
              <MoneyInput
                currency={currency}
                hideHelpers
                onChange={setPrice}
                value={price}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t('status')}</Label>
              <Select onValueChange={setStatus} value={status}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{t('statuses.draft')}</SelectItem>
                  <SelectItem value="published">
                    {t('statuses.published')}
                  </SelectItem>
                  <SelectItem value="paused">{t('statuses.paused')}</SelectItem>
                  <SelectItem value="archived">
                    {t('statuses.archived')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {listing.listingType === 'product' ? (
            <div className="grid gap-3 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid min-w-44 gap-1.5">
                  <Label>{t('applyTemplate')}</Label>
                  <Select
                    onValueChange={(templateId) => {
                      const template = templates.data?.data.find(
                        (item) => item.id === templateId
                      );
                      if (template) {
                        setOptions(
                          template.groups.map((group) => ({
                            name: group.name,
                            values: group.values.map((value) => value.label),
                          }))
                        );
                      }
                    }}
                    value=""
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('applyTemplate')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(templates.data?.data ?? []).map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid min-w-40 flex-1 gap-1.5">
                  <Label>{t('templateName')}</Label>
                  <Input
                    onChange={(event) => setTemplateName(event.target.value)}
                    placeholder={t('templateNamePlaceholder')}
                    value={templateName}
                  />
                </div>
                <Button
                  disabled={
                    !templateName.trim() ||
                    options.length === 0 ||
                    saveTemplateMutation.isPending
                  }
                  onClick={() => saveTemplateMutation.mutate()}
                  type="button"
                  variant="secondary"
                >
                  {t('saveAsTemplate')}
                </Button>
              </div>

              {/* Option groups */}
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{t('options')}</span>
                <Button
                  onClick={() =>
                    setOptions([...options, { name: '', values: [] }])
                  }
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <Plus className="h-4 w-4" />
                  {t('addOption')}
                </Button>
              </div>
              {options.map((group, index) => (
                <div
                  className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end"
                  key={`option-${index}`}
                >
                  <Input
                    onChange={(event) =>
                      setOptions(
                        options.map((g, i) =>
                          i === index ? { ...g, name: event.target.value } : g
                        )
                      )
                    }
                    placeholder={t('optionNamePlaceholder')}
                    value={group.name}
                  />
                  <Input
                    onChange={(event) =>
                      setOptions(
                        options.map((g, i) =>
                          i === index
                            ? { ...g, values: event.target.value.split(',') }
                            : g
                        )
                      )
                    }
                    placeholder={t('optionValuesPlaceholder')}
                    value={group.values.join(', ')}
                  />
                  <Button
                    className="h-9 w-9 p-0"
                    onClick={() =>
                      setOptions(options.filter((_, i) => i !== index))
                    }
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {/* Variants */}
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{t('variants')}</span>
                <Button
                  disabled={options.length === 0}
                  onClick={() =>
                    setVariants([
                      ...variants,
                      {
                        optionValueLabels: {},
                        price: null,
                        productId: '',
                        sku: '',
                        status: 'active',
                      },
                    ])
                  }
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <Plus className="h-4 w-4" />
                  {t('addVariant')}
                </Button>
              </div>
              {variants.map((variant, index) => {
                const update = (next: Partial<VariantDraft>) =>
                  setVariants(
                    variants.map((item, i) =>
                      i === index ? { ...item, ...next } : item
                    )
                  );
                return (
                  <div
                    className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-2"
                    key={`variant-${index}`}
                  >
                    {options
                      .filter((group) => group.name.trim())
                      .map((group) => (
                        <div className="grid gap-1.5" key={group.name}>
                          <Label>{group.name}</Label>
                          <Select
                            onValueChange={(label) =>
                              update({
                                optionValueLabels: {
                                  ...variant.optionValueLabels,
                                  [group.name]: label,
                                },
                              })
                            }
                            value={variant.optionValueLabels[group.name] ?? ''}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t('selectValue')} />
                            </SelectTrigger>
                            <SelectContent>
                              {group.values
                                .map((label) => label.trim())
                                .filter(Boolean)
                                .map((label) => (
                                  <SelectItem key={label} value={label}>
                                    {label}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    <div className="grid gap-1.5">
                      <Label>{t('stockProduct')}</Label>
                      <Select
                        onValueChange={(productId) => update({ productId })}
                        value={variant.productId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('selectProduct')} />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>{t('price')}</Label>
                      <MoneyInput
                        currency={currency}
                        hideHelpers
                        onChange={(value) => update({ price: value })}
                        value={variant.price ?? 0}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>{t('sku')}</Label>
                      <Input
                        onChange={(event) =>
                          update({ sku: event.target.value })
                        }
                        value={variant.sku}
                      />
                    </div>
                    <div className="flex items-center justify-end sm:col-span-2">
                      <Button
                        onClick={() =>
                          setVariants(variants.filter((_, i) => i !== index))
                        }
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t('remove')}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            disabled={!title || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            type="button"
          >
            {saveMutation.isPending ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
