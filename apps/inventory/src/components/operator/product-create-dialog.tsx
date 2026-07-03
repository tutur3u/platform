'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Boxes, FileImage, PackagePlus, Tags } from '@tuturuuu/icons';
import type { InventoryProductFormOptionsResponse } from '@tuturuuu/internal-api/inventory';
import {
  createInventoryManufacturer,
  createInventoryOwner,
  createInventoryProduct,
  createInventoryProductCategory,
  createInventoryUnit,
  createInventoryWarehouse,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useState } from 'react';
import { InventoryImageUploadField } from './inventory-image-upload';
import {
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
  OperatorDialogTabs,
} from './operator-dialog-shell';
import {
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
  ToggleField,
} from './operator-form-fields';
import { useProductSuggestions } from './product-form-suggestions';
import type { ProductFormState } from './product-form-types';
import { invalidateProducts } from './product-row-actions';
import { SmartSuggestions } from './smart-suggestions';

const initialState: ProductFormState = {
  amount: '',
  avatarUrl: '',
  categoryId: '',
  description: '',
  financeCategoryId: '',
  manufacturerId: '',
  minAmount: '',
  name: '',
  ownerId: '',
  price: '',
  revenueSharePartnerId: '',
  revenueShareSplitPercent: '',
  unitId: '',
  unlimitedStock: false,
  usage: '',
  warehouseId: '',
};

export function ProductCreateForm({
  options,
  trigger,
  wsId,
}: {
  options?: InventoryProductFormOptionsResponse;
  trigger?: ReactNode;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProductFormState>(initialState);
  const [open, setOpen] = useState(false);
  const amountValue = form.amount.trim();
  const minAmountValue = form.minAmount.trim();
  const priceValue = form.price.trim();
  const splitValue = form.revenueShareSplitPercent.trim();
  const hasRevenueShareValues = Boolean(
    form.revenueSharePartnerId || splitValue
  );
  const hasStockValues = Boolean(
    amountValue || minAmountValue || priceValue || hasRevenueShareValues
  );
  const hasStockTarget = Boolean(form.unitId && form.warehouseId);
  const needsStockTarget = Boolean(form.unlimitedStock || hasStockValues);
  const shouldCreateStockRow = hasStockTarget && needsStockTarget;
  const mutation = useMutation({
    mutationFn: () =>
      createInventoryProduct(wsId, {
        avatar_url: form.avatarUrl || null,
        category_id: form.categoryId,
        description: form.description || undefined,
        finance_category_id: form.financeCategoryId || null,
        inventory: shouldCreateStockRow
          ? [
              {
                amount: form.unlimitedStock ? null : Number(amountValue || 0),
                min_amount: Number(minAmountValue || 0),
                price: Number(priceValue || 0),
                revenue_share_bps: Math.round(Number(splitValue || 0) * 100),
                revenue_share_partner_id: form.revenueSharePartnerId || null,
                unit_id: form.unitId,
                warehouse_id: form.warehouseId,
              },
            ]
          : [],
        manufacturer_id: form.manufacturerId || null,
        name: form.name,
        owner_id: form.ownerId || undefined,
        usage: form.usage || undefined,
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      setForm(initialState);
      setOpen(false);
      toast.success(t('saveSuccess'));
      invalidateProducts(queryClient, wsId);
    },
  });
  const canSubmit = Boolean(form.name && form.categoryId && form.ownerId);
  const stockReady = !needsStockTarget || hasStockTarget;
  const suggestions = useProductSuggestions(form, setForm, options);
  const createReference = async (create: () => Promise<unknown>) => {
    try {
      const result = await create();
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'form-options'],
      });
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('saveError'));
      throw error;
    }
  };
  const referenceCreateText = (resource: string) =>
    t('createOption', { resource });
  const referenceCreatingText = (resource: string) =>
    t('creatingOption', { resource });
  const referenceSearchText = (resource: string) =>
    t('searchOptions', { resource });

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setForm(initialState);
      }}
      open={open}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button">
            <PackagePlus className="h-4 w-4" />
            {t('newProduct')}
          </Button>
        )}
      </DialogTrigger>
      <OperatorDialogContent size="lg">
        <OperatorDialogHeader
          description={t('createProductDescription')}
          title={t('createProductTitle')}
        />
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (canSubmit && stockReady) mutation.mutate();
          }}
        >
          <OperatorDialogTabs
            tabs={[
              {
                content: (
                  <div className="grid gap-5">
                    {suggestions.length ? (
                      <SmartSuggestions
                        emptyLabel={t('suggestions.empty')}
                        suggestions={suggestions}
                        title={t('suggestions.title')}
                      />
                    ) : null}
                    <div className="grid gap-3 md:grid-cols-2">
                      <TextField
                        className="md:col-span-2"
                        label={t('productName')}
                        onChange={(name) =>
                          setForm((current) => ({ ...current, name }))
                        }
                        placeholder={t('placeholders.productName')}
                        value={form.name}
                      />
                      <SelectField
                        createText={referenceCreateText(t('category'))}
                        creatingText={referenceCreatingText(t('category'))}
                        emptyText={t('emptyOptions')}
                        hint={t('hints.category')}
                        label={t('category')}
                        onChange={(categoryId) =>
                          setForm((current) => ({ ...current, categoryId }))
                        }
                        onCreate={(name) =>
                          createReference(() =>
                            createInventoryProductCategory(wsId, { name })
                          )
                        }
                        options={options?.categories}
                        placeholder={t('placeholders.category')}
                        searchPlaceholder={referenceSearchText(t('category'))}
                        value={form.categoryId}
                      />
                      <SelectField
                        createText={referenceCreateText(t('owner'))}
                        creatingText={referenceCreatingText(t('owner'))}
                        emptyText={t('emptyOptions')}
                        hint={t('hints.owner')}
                        label={t('owner')}
                        onChange={(ownerId) =>
                          setForm((current) => ({ ...current, ownerId }))
                        }
                        onCreate={(name) =>
                          createReference(() =>
                            createInventoryOwner(wsId, { name })
                          )
                        }
                        options={options?.owners}
                        placeholder={t('placeholders.owner')}
                        searchPlaceholder={referenceSearchText(t('owner'))}
                        value={form.ownerId}
                      />
                      <SelectField
                        createText={referenceCreateText(t('manufacturer'))}
                        creatingText={referenceCreatingText(t('manufacturer'))}
                        emptyText={t('emptyOptions')}
                        hint={t('hints.manufacturer')}
                        label={t('manufacturer')}
                        onChange={(manufacturerId) =>
                          setForm((current) => ({ ...current, manufacturerId }))
                        }
                        onCreate={(name) =>
                          createReference(() =>
                            createInventoryManufacturer(wsId, { name })
                          )
                        }
                        options={options?.manufacturers}
                        placeholder={t('placeholders.manufacturer')}
                        searchPlaceholder={referenceSearchText(
                          t('manufacturer')
                        )}
                        value={form.manufacturerId}
                      />
                      <SelectField
                        emptyText={t('emptyOptions')}
                        hint={t('hints.financeCategory')}
                        label={t('financeCategory')}
                        onChange={(financeCategoryId) =>
                          setForm((current) => ({
                            ...current,
                            financeCategoryId,
                          }))
                        }
                        options={options?.financeCategories?.flatMap((item) =>
                          item.id ? [{ id: item.id, name: item.name }] : []
                        )}
                        placeholder={t('placeholders.financeCategory')}
                        searchPlaceholder={referenceSearchText(
                          t('financeCategory')
                        )}
                        value={form.financeCategoryId}
                      />
                      <TextField
                        hint={t('hints.usage')}
                        label={t('usage')}
                        onChange={(usage) =>
                          setForm((current) => ({ ...current, usage }))
                        }
                        placeholder={t('placeholders.usage')}
                        value={form.usage}
                      />
                      <TextAreaField
                        className="md:col-span-2"
                        label={t('description')}
                        onChange={(description) =>
                          setForm((current) => ({ ...current, description }))
                        }
                        placeholder={t('placeholders.productDescription')}
                        value={form.description}
                      />
                    </div>
                  </div>
                ),
                icon: <Tags className="h-4 w-4" />,
                label: t('steps.productDetails'),
                value: 'details',
              },
              {
                content: (
                  <InventoryImageUploadField
                    description={t('featuredImageDescription')}
                    label={t('featuredImage')}
                    onChange={(avatarUrl) =>
                      setForm((current) => ({ ...current, avatarUrl }))
                    }
                    target="product-featured-image"
                    value={form.avatarUrl}
                    wsId={wsId}
                  />
                ),
                icon: <FileImage className="h-4 w-4" />,
                label: t('steps.productMedia'),
                value: 'media',
              },
              {
                content: (
                  <div className="grid gap-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <ToggleField
                        checked={form.unlimitedStock}
                        className="items-start md:col-span-2"
                        onChange={(unlimitedStock) =>
                          setForm((current) => ({
                            ...current,
                            amount: unlimitedStock ? '' : current.amount,
                            unlimitedStock,
                          }))
                        }
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
                      <SelectField
                        createText={referenceCreateText(t('unit'))}
                        creatingText={referenceCreatingText(t('unit'))}
                        emptyText={t('emptyOptions')}
                        hint={t('hints.unit')}
                        label={t('unit')}
                        onChange={(unitId) =>
                          setForm((current) => ({ ...current, unitId }))
                        }
                        onCreate={(name) =>
                          createReference(() =>
                            createInventoryUnit(wsId, { name })
                          )
                        }
                        options={options?.units}
                        placeholder={t('placeholders.unit')}
                        searchPlaceholder={referenceSearchText(t('unit'))}
                        value={form.unitId}
                      />
                      <SelectField
                        createText={referenceCreateText(t('warehouse'))}
                        creatingText={referenceCreatingText(t('warehouse'))}
                        emptyText={t('emptyOptions')}
                        hint={t('hints.warehouse')}
                        label={t('warehouse')}
                        onChange={(warehouseId) =>
                          setForm((current) => ({ ...current, warehouseId }))
                        }
                        onCreate={(name) =>
                          createReference(() =>
                            createInventoryWarehouse(wsId, { name })
                          )
                        }
                        options={options?.warehouses}
                        placeholder={t('placeholders.warehouse')}
                        searchPlaceholder={referenceSearchText(t('warehouse'))}
                        value={form.warehouseId}
                      />
                      <NumberField
                        disabled={form.unlimitedStock}
                        hint={t('hints.amount')}
                        label={t('amount')}
                        onChange={(amount) =>
                          setForm((current) => ({ ...current, amount }))
                        }
                        placeholder={
                          form.unlimitedStock
                            ? t('unlimitedStock')
                            : t('placeholders.amount')
                        }
                        value={form.amount}
                      />
                      <NumberField
                        hint={t('hints.minAmount')}
                        label={t('minAmount')}
                        onChange={(minAmount) =>
                          setForm((current) => ({ ...current, minAmount }))
                        }
                        placeholder={t('placeholders.minAmount')}
                        value={form.minAmount}
                      />
                      <NumberField
                        hint={t('hints.price')}
                        label={t('price')}
                        onChange={(price) =>
                          setForm((current) => ({ ...current, price }))
                        }
                        placeholder={t('placeholders.price')}
                        value={form.price}
                      />
                      <SelectField
                        className="lg:col-span-2"
                        createText={referenceCreateText(
                          t('revenueSharePartner')
                        )}
                        creatingText={referenceCreatingText(
                          t('revenueSharePartner')
                        )}
                        emptyText={t('emptyOptions')}
                        hint={t('hints.revenueSharePartner')}
                        label={t('revenueSharePartner')}
                        onChange={(revenueSharePartnerId) =>
                          setForm((current) => ({
                            ...current,
                            revenueSharePartnerId,
                          }))
                        }
                        onCreate={(name) =>
                          createReference(() =>
                            createInventoryOwner(wsId, { name })
                          )
                        }
                        options={options?.owners}
                        placeholder={t('placeholders.revenueSharePartner')}
                        searchPlaceholder={referenceSearchText(
                          t('revenueSharePartner')
                        )}
                        value={form.revenueSharePartnerId}
                      />
                      <NumberField
                        hint={t('hints.revenueShareSplitPercent')}
                        label={t('revenueShareSplitPercent')}
                        onChange={(revenueShareSplitPercent) =>
                          setForm((current) => ({
                            ...current,
                            revenueShareSplitPercent,
                          }))
                        }
                        placeholder={t('placeholders.revenueShareSplitPercent')}
                        value={form.revenueShareSplitPercent}
                      />
                    </div>
                    {needsStockTarget && !hasStockTarget ? (
                      <p className="text-amber-600 text-xs leading-5 dark:text-amber-500">
                        {t('stockTargetHint')}
                      </p>
                    ) : null}
                  </div>
                ),
                icon: <Boxes className="h-4 w-4" />,
                label: t('steps.productStock'),
                value: 'stock',
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
              disabled={!canSubmit || !stockReady || mutation.isPending}
              type="submit"
            >
              {mutation.isPending ? t('creating') : t('create')}
            </Button>
          </OperatorDialogFooter>
        </form>
      </OperatorDialogContent>
    </Dialog>
  );
}
