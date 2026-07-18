'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Boxes,
  Calculator,
  History,
  Loader2,
  Pencil,
  Save,
  Tags,
} from '@tuturuuu/icons';
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
import { cn } from '@tuturuuu/utils/format';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import { InventoryImageUploadField } from './inventory-image-upload';
import {
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
  OperatorDialogTabs,
} from './operator-dialog-shell';
import { SelectField, TextAreaField, TextField } from './operator-form-fields';
import { currency } from './operator-format';
import { LifecyclePanel } from './operator-lifecycle';
import { bestMarginAcrossProfiles } from './operator-margin';
import {
  getInitialProductStockRows,
  getProductStockSaveState,
  type ProductStockChangeContextState,
  ProductStockEditor,
} from './product-stock-editor';

const ProductStockHistory = dynamic(
  () =>
    import('./product-stock-history').then(
      (module) => module.ProductStockHistory
    ),
  {
    loading: () => (
      <div className="grid min-h-56 place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    ),
  }
);

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
  const [details, setDetails] = useState(() => getInitialDetails(row));
  const [activeTab, setActiveTab] = useState('details');
  const initialStockRows = useMemo(
    () => getInitialProductStockRows(row),
    [row]
  );
  const initialHadStockRows = useMemo(
    () => initialStockRows.some((stockRow) => stockRow.existing),
    [initialStockRows]
  );
  const [stockRows, setStockRows] = useState(initialStockRows);
  const [stockChangeContext, setStockChangeContext] =
    useState<ProductStockChangeContextState>(emptyStockChangeContext);
  const stockSaveState = useMemo(
    () => getProductStockSaveState(stockRows, initialHadStockRows),
    [initialHadStockRows, stockRows]
  );
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
  const margin = useMemo(
    () => bestMarginAcrossProfiles(matchingCostProfiles),
    [matchingCostProfiles]
  );
  const canSaveDetails = Boolean(
    details.name.trim() && details.categoryId && details.ownerId
  );

  const resetForm = () => {
    setActiveTab('details');
    setDetails(getInitialDetails(row));
    setStockRows(getInitialProductStockRows(row));
    setStockChangeContext(emptyStockChangeContext);
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

      if (stockSaveState.shouldSave) {
        await updateInventoryProductInventory(wsId, row.id, {
          changeContext:
            stockChangeContext.beneficiaryId || stockChangeContext.note.trim()
              ? {
                  beneficiaryId: stockChangeContext.beneficiaryId || undefined,
                  note: stockChangeContext.note,
                }
              : undefined,
          inventory: stockSaveState.inventory,
        });
      }
    },
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      onOpenChange(false);
      invalidateProducts(queryClient, wsId);
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'product-history', row.id],
      });
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
    onSuccess: ({ disposition }) => {
      toast.success(
        disposition === 'archived'
          ? t('deleteArchivedSuccess')
          : t('deleteSuccess')
      );
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
      <OperatorDialogContent mobileFullscreen size="lg">
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
            onValueChange={setActiveTab}
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
                content: (
                  <ProductStockEditor
                    changeContext={stockChangeContext}
                    onChangeContext={setStockChangeContext}
                    onRowsChange={setStockRows}
                    options={options}
                    rows={stockRows}
                    saveState={stockSaveState}
                    wsId={wsId}
                  />
                ),
                icon: <Boxes className="h-4 w-4" />,
                label: t('tabs.stock'),
                value: 'stock',
              },
              {
                content: <ProductStockHistory productId={row.id} wsId={wsId} />,
                icon: <History className="h-4 w-4" />,
                label: t('tabs.history'),
                value: 'history',
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
                        {margin ? (
                          <div className="mt-1 grid gap-2 rounded-md border border-border bg-background p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground text-xs">
                                {t('estimatedMargin')}
                              </span>
                              <span
                                className={cn(
                                  'font-semibold text-sm',
                                  margin.marginPercentage >= 0
                                    ? 'text-dynamic-green'
                                    : 'text-dynamic-red'
                                )}
                              >
                                {margin.marginPercentage}%
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <MarginStat
                                label={t('retail')}
                                value={currency(margin.retail, margin.currency)}
                              />
                              <MarginStat
                                label={t('unitCost')}
                                value={currency(
                                  margin.unitCost,
                                  margin.currency
                                )}
                              />
                              <MarginStat
                                label={t('profitPerUnit')}
                                value={currency(
                                  margin.profitPerUnit,
                                  margin.currency
                                )}
                              />
                            </div>
                            <p className="text-[0.7rem] text-muted-foreground">
                              {t('marginFrom', {
                                count: matchingCostProfiles.length,
                              })}
                            </p>
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
                label: t('tabs.lifecycle'),
                value: 'coverage',
              },
            ]}
            value={activeTab}
          />
          <OperatorDialogFooter className="sm:justify-between">
            <Button
              onClick={() => setActiveTab('coverage')}
              type="button"
              variant="outline"
            >
              <Archive className="h-4 w-4" />
              {t('archiveOrRemove')}
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  {t('cancel')}
                </Button>
              </DialogClose>
              <Button
                disabled={
                  !canSaveDetails ||
                  !stockSaveState.canSave ||
                  saveMutation.isPending
                }
                type="submit"
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? t('saving') : t('save')}
              </Button>
            </div>
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

function MarginStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="grid gap-0.5 rounded-md border border-border bg-muted/30 p-2">
      <span className="truncate text-[0.7rem] text-muted-foreground">
        {label}
      </span>
      <span className="truncate font-medium">{value}</span>
    </span>
  );
}

function normalizeMatch(value: string) {
  return value.trim().toLocaleLowerCase();
}

const emptyStockChangeContext: ProductStockChangeContextState = {
  beneficiaryId: '',
  note: '',
};
