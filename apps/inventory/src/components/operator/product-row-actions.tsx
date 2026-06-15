'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Boxes, Calculator, Pencil, Save, Tags } from '@tuturuuu/icons';
import type {
  InventoryCostProfile,
  InventoryProductFormOptionsResponse,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import {
  deleteInventoryProduct,
  updateInventoryProduct,
  updateInventoryProductInventory,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import { InventoryImageUploadField } from './inventory-image-upload';
import {
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
  OperatorDialogTabs,
} from './operator-dialog-shell';
import {
  SelectField,
  TextAreaField,
  TextField,
  ToggleField,
} from './operator-form-fields';
import { LifecyclePanel } from './operator-lifecycle';
import { stockAmountFromRecords } from './operator-stock';

export function invalidateProducts(
  queryClient: ReturnType<typeof useQueryClient>,
  wsId: string
) {
  queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'products'] });
  queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'overview'] });
  queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
}

/**
 * The product edit dialog. Controlled by `open`/`onOpenChange` so it can be
 * opened both from the row actions button and from a full-row click. Render it
 * with a stable `key={row.id}` when controlled so state initializes per product.
 */
export function ProductEditDialog({
  costingProfiles = [],
  onOpenChange,
  open,
  options,
  row,
  trigger,
  wsId,
}: {
  costingProfiles?: InventoryCostProfile[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  options?: InventoryProductFormOptionsResponse;
  row: InventoryProductSummary;
  trigger?: ReactNode;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const operatorText = useTranslations('inventory.operator');
  const queryClient = useQueryClient();
  const inventory = row.inventory?.[0] ?? {};
  const stockAmount = stockAmountFromRecords(inventory, row.stock?.[0]);
  const [details, setDetails] = useState(() => getInitialDetails(row));
  const [amount, setAmount] = useState(
    stockAmount == null ? '' : String(stockAmount)
  );
  const [minAmount, setMinAmount] = useState(String(inventory.min_amount ?? 0));
  const [price, setPrice] = useState(String(inventory.price ?? 0));
  const [unlimitedStock, setUnlimitedStock] = useState(stockAmount === null);
  const canUpdateStock = Boolean(inventory.unit_id && inventory.warehouse_id);
  const matchingCostProfiles = useMemo(
    () =>
      costingProfiles.filter((profile) => {
        if (profile.productId === row.id) return true;
        if (profile.categoryId && profile.categoryId === details.categoryId) {
          return true;
        }

        return normalizeMatch(profile.name) === normalizeMatch(row.name);
      }),
    [costingProfiles, details.categoryId, row.id, row.name]
  );
  const canSaveDetails = Boolean(
    details.name.trim() && details.categoryId && details.ownerId
  );

  const resetForm = () => {
    setDetails(getInitialDetails(row));
    setAmount(stockAmount == null ? '' : String(stockAmount));
    setMinAmount(String(inventory.min_amount ?? 0));
    setPrice(String(inventory.price ?? 0));
    setUnlimitedStock(stockAmount === null);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      await updateInventoryProduct(wsId, row.id, {
        avatar_url: details.avatarUrl || null,
        category_id: details.categoryId,
        description: details.description || undefined,
        finance_category_id: details.financeCategoryId || null,
        manufacturer_id: details.manufacturerId || null,
        name: details.name.trim(),
        owner_id: details.ownerId,
        usage: details.usage || undefined,
      });

      if (!canUpdateStock) return;

      await updateInventoryProductInventory(wsId, row.id, {
        inventory: [
          {
            amount: unlimitedStock ? null : Number(amount || 0),
            min_amount: Number(minAmount || 0),
            price: Number(price || 0),
            unit_id: String(inventory.unit_id ?? ''),
            warehouse_id: String(inventory.warehouse_id ?? ''),
          },
        ],
      });
    },
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      onOpenChange(false);
      invalidateProducts(queryClient, wsId);
    },
  });
  const archiveMutation = useMutation({
    mutationFn: () =>
      updateInventoryProduct(wsId, row.id, {
        archived: true,
        avatar_url: details.avatarUrl || null,
        category_id: details.categoryId,
        description: details.description || undefined,
        finance_category_id: details.financeCategoryId || null,
        manufacturer_id: details.manufacturerId || null,
        name: details.name.trim() || row.name,
        owner_id: details.ownerId || row.owner_id || row.owner?.id || '',
        usage: details.usage || undefined,
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      onOpenChange(false);
      invalidateProducts(queryClient, wsId);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteInventoryProduct(wsId, row.id),
    onError: () => toast.error(t('deleteError')),
    onSuccess: () => {
      toast.success(t('deleteSuccess'));
      onOpenChange(false);
      invalidateProducts(queryClient, wsId);
    },
  });

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) resetForm();
        onOpenChange(nextOpen);
      }}
      open={open}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <OperatorDialogContent size="lg">
        <OperatorDialogHeader
          description={t('editProductDescription')}
          title={t('editProductTitle')}
        />
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSaveDetails) saveMutation.mutate();
          }}
        >
          <OperatorDialogTabs
            tabs={[
              {
                content: (
                  <div className="grid min-w-0 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                    <TextField
                      label={t('productName')}
                      onChange={(name) =>
                        setDetails((current) => ({ ...current, name }))
                      }
                      placeholder={t('placeholders.productName')}
                      value={details.name}
                    />
                    <SelectField
                      emptyText={t('emptyOptions')}
                      hint={t('hints.category')}
                      label={t('category')}
                      onChange={(categoryId) =>
                        setDetails((current) => ({ ...current, categoryId }))
                      }
                      options={options?.categories}
                      placeholder={t('placeholders.category')}
                      searchPlaceholder={t('searchOptions', {
                        resource: t('category'),
                      })}
                      value={details.categoryId}
                    />
                    <SelectField
                      emptyText={t('emptyOptions')}
                      hint={t('hints.owner')}
                      label={t('owner')}
                      onChange={(ownerId) =>
                        setDetails((current) => ({ ...current, ownerId }))
                      }
                      options={options?.owners}
                      placeholder={t('placeholders.owner')}
                      searchPlaceholder={t('searchOptions', {
                        resource: t('owner'),
                      })}
                      value={details.ownerId}
                    />
                    <SelectField
                      emptyText={t('emptyOptions')}
                      hint={t('hints.manufacturer')}
                      label={t('manufacturer')}
                      onChange={(manufacturerId) =>
                        setDetails((current) => ({
                          ...current,
                          manufacturerId,
                        }))
                      }
                      options={options?.manufacturers}
                      placeholder={t('placeholders.manufacturer')}
                      searchPlaceholder={t('searchOptions', {
                        resource: t('manufacturer'),
                      })}
                      value={details.manufacturerId}
                    />
                    <SelectField
                      emptyText={t('emptyOptions')}
                      hint={t('hints.financeCategory')}
                      label={t('financeCategory')}
                      onChange={(financeCategoryId) =>
                        setDetails((current) => ({
                          ...current,
                          financeCategoryId,
                        }))
                      }
                      options={options?.financeCategories?.flatMap((item) =>
                        item.id ? [{ id: item.id, name: item.name }] : []
                      )}
                      placeholder={t('placeholders.financeCategory')}
                      searchPlaceholder={t('searchOptions', {
                        resource: t('financeCategory'),
                      })}
                      value={details.financeCategoryId}
                    />
                    <TextField
                      hint={t('hints.usage')}
                      label={t('usage')}
                      onChange={(usage) =>
                        setDetails((current) => ({ ...current, usage }))
                      }
                      placeholder={t('placeholders.usage')}
                      value={details.usage}
                    />
                    <div className="lg:col-span-2 xl:col-span-3">
                      <InventoryImageUploadField
                        description={t('featuredImageDescription')}
                        label={t('featuredImage')}
                        onChange={(avatarUrl) =>
                          setDetails((current) => ({ ...current, avatarUrl }))
                        }
                        target="product-featured-image"
                        value={details.avatarUrl}
                        wsId={wsId}
                      />
                    </div>
                    <TextAreaField
                      className="lg:col-span-2 xl:col-span-3"
                      label={t('description')}
                      onChange={(description) =>
                        setDetails((current) => ({ ...current, description }))
                      }
                      placeholder={t('placeholders.productDescription')}
                      value={details.description}
                    />
                  </div>
                ),
                icon: <Tags className="h-4 w-4" />,
                label: t('tabs.details'),
                value: 'details',
              },
              {
                content: canUpdateStock ? (
                  <div className="grid min-w-0 gap-3 lg:grid-cols-3">
                    <ToggleField
                      checked={unlimitedStock}
                      className="items-start lg:col-span-3"
                      onChange={(nextUnlimitedStock) => {
                        setUnlimitedStock(nextUnlimitedStock);
                        if (nextUnlimitedStock) setAmount('');
                      }}
                    >
                      <span className="grid gap-1">
                        <span className="font-medium">
                          {t('unlimitedStock')}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {t('unlimitedStockDescription')}
                        </span>
                      </span>
                    </ToggleField>
                    <TextField
                      disabled={unlimitedStock}
                      hint={t('hints.amount')}
                      inputMode="numeric"
                      label={t('amount')}
                      onChange={setAmount}
                      placeholder={
                        unlimitedStock
                          ? t('unlimitedStock')
                          : t('placeholders.amount')
                      }
                      value={amount}
                    />
                    <TextField
                      hint={t('hints.minAmount')}
                      inputMode="numeric"
                      label={t('minAmount')}
                      onChange={setMinAmount}
                      placeholder={t('placeholders.minAmount')}
                      value={minAmount}
                    />
                    <TextField
                      hint={t('hints.price')}
                      inputMode="numeric"
                      label={t('price')}
                      onChange={setPrice}
                      placeholder={t('placeholders.price')}
                      value={price}
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-muted/20 p-4 text-muted-foreground text-sm">
                    {t('stockUnavailableDescription')}
                  </div>
                ),
                icon: <Boxes className="h-4 w-4" />,
                label: t('tabs.stock'),
                value: 'stock',
              },
              {
                content: (
                  <div className="grid min-w-0 gap-6">
                    <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                      <section className="grid min-w-0 gap-2 rounded-lg border border-border bg-muted/15 p-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Calculator className="h-4 w-4 text-muted-foreground" />
                          <h3 className="font-semibold text-sm">
                            {operatorText('badges.costingReady')}
                          </h3>
                        </div>
                        <p className="text-muted-foreground text-sm leading-6">
                          {matchingCostProfiles.length
                            ? t('costingCoverageReady', {
                                count: matchingCostProfiles.length,
                              })
                            : t('costingCoverageMissing')}
                        </p>
                        {matchingCostProfiles.length ? (
                          <div className="flex min-w-0 flex-wrap gap-2">
                            {matchingCostProfiles.map((profile) => (
                              <span
                                className="inline-flex max-w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                                key={profile.id}
                              >
                                <span className="truncate">{profile.name}</span>
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </section>
                      <section className="grid min-w-0 gap-2 rounded-lg border border-border bg-muted/15 p-3">
                        <h3 className="font-semibold text-sm">
                          {t('listingCoverage')}
                        </h3>
                        <p className="text-muted-foreground text-sm leading-6">
                          {t('listingCoverageDescription')}
                        </p>
                      </section>
                    </div>
                    <LifecyclePanel
                      archiveDisabled={
                        archiveMutation.isPending ||
                        !details.categoryId ||
                        !details.ownerId
                      }
                      archivePending={archiveMutation.isPending}
                      deletePending={deleteMutation.isPending}
                      onArchive={() => archiveMutation.mutate()}
                      onDelete={() => deleteMutation.mutate()}
                      title={t('lifecycle')}
                    />
                  </div>
                ),
                icon: <Calculator className="h-4 w-4" />,
                label: t('tabs.coverage'),
                value: 'coverage',
              },
            ]}
          />
          <OperatorDialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button
              disabled={!canSaveDetails || saveMutation.isPending}
              type="submit"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? t('saving') : t('save')}
            </Button>
          </OperatorDialogFooter>
        </form>
      </OperatorDialogContent>
    </Dialog>
  );
}

/**
 * Standalone row actions: an Edit button that opens its own `ProductEditDialog`.
 * Kept for callers that render the dialog inline; the products table instead
 * controls a single shared dialog so a full-row click can open it too.
 */
export function ProductRowActions(
  props: Omit<
    Parameters<typeof ProductEditDialog>[0],
    'onOpenChange' | 'open' | 'trigger'
  >
) {
  const t = useTranslations('inventory.operator.forms');
  const [open, setOpen] = useState(false);

  return (
    <ProductEditDialog
      {...props}
      onOpenChange={setOpen}
      open={open}
      trigger={
        <Button size="sm" type="button" variant="outline">
          <Pencil className="h-4 w-4" />
          {t('edit')}
        </Button>
      }
    />
  );
}

function getInitialDetails(row: InventoryProductSummary) {
  return {
    avatarUrl: row.avatar_url ?? '',
    categoryId: row.category_id ?? '',
    description: row.description ?? '',
    financeCategoryId: row.finance_category_id ?? '',
    manufacturerId: row.manufacturer_id ?? '',
    name: row.name,
    ownerId: row.owner_id ?? row.owner?.id ?? '',
    usage: row.usage ?? '',
  };
}

function normalizeMatch(value: string) {
  return value.trim().toLocaleLowerCase();
}
