'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListTree, Pencil, Save } from '@tuturuuu/icons';
import type {
  InventoryListingStatus,
  InventoryProductSummary,
  InventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';
import {
  createInventoryOptionTemplate,
  deleteInventoryStorefrontListing,
  listInventoryOptionTemplates,
  updateInventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { MoneyInput } from '@tuturuuu/ui/money-input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  FormSection,
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';
import { SelectValueField } from './operator-form-fields';
import { LifecyclePanel } from './operator-lifecycle';
import {
  buildOptionsVariantsPayload,
  type OptionGroupDraft,
  StorefrontListingOptionsEditor,
  type VariantDraft,
} from './storefront-listing-options-editor';

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
