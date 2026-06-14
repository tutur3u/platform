'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Boxes,
  ClipboardCheck,
  FileImage,
  PackagePlus,
  Tags,
} from '@tuturuuu/icons';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useState } from 'react';
import { FormStepper, StepPanel, StepperDialogFooter } from './form-stepper';
import { InventoryImageUploadField } from './inventory-image-upload';
import { operatorDialogContentClassName } from './operator-dialog';
import {
  labelFor,
  NumberField,
  ReviewRows,
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
  manufacturerId: '',
  minAmount: '',
  name: '',
  ownerId: '',
  price: '',
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
  const [step, setStep] = useState(0);
  const steps = [
    {
      description: t('steps.productDetailsDescription'),
      icon: Tags,
      id: 'details',
      title: t('steps.productDetails'),
    },
    {
      description: t('steps.productMediaDescription'),
      icon: FileImage,
      id: 'media',
      title: t('steps.productMedia'),
    },
    {
      description: t('steps.productStockDescription'),
      icon: Boxes,
      id: 'stock',
      title: t('steps.productStock'),
    },
    {
      description: t('steps.reviewDescription'),
      icon: ClipboardCheck,
      id: 'review',
      title: t('steps.review'),
    },
  ];
  const amountValue = form.amount.trim();
  const minAmountValue = form.minAmount.trim();
  const priceValue = form.price.trim();
  const hasStockValues = Boolean(amountValue || minAmountValue || priceValue);
  const hasStockTarget = Boolean(form.unitId && form.warehouseId);
  const needsStockTarget = Boolean(form.unlimitedStock || hasStockValues);
  const shouldCreateStockRow = hasStockTarget && needsStockTarget;
  const mutation = useMutation({
    mutationFn: () =>
      createInventoryProduct(wsId, {
        avatar_url: form.avatarUrl || null,
        category_id: form.categoryId,
        description: form.description || undefined,
        inventory: shouldCreateStockRow
          ? [
              {
                amount: form.unlimitedStock ? null : Number(amountValue || 0),
                min_amount: Number(minAmountValue || 0),
                price: Number(priceValue || 0),
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
      setStep(0);
      setOpen(false);
      toast.success(t('saveSuccess'));
      invalidateProducts(queryClient, wsId);
    },
  });
  const canSubmit = Boolean(form.name && form.categoryId && form.ownerId);
  const canContinue =
    step === 0
      ? canSubmit
      : step === 2
        ? !needsStockTarget || hasStockTarget
        : true;
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
    <div className="flex justify-end">
      <Dialog
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setStep(0);
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
        <DialogContent className={operatorDialogContentClassName('workflow')}>
          <DialogHeader>
            <DialogTitle>{t('createProductTitle')}</DialogTitle>
            <DialogDescription>
              {t('createProductDescription')}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-5"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (step !== steps.length - 1) return;
              if (canSubmit) mutation.mutate();
            }}
          >
            <FormStepper activeIndex={step} steps={steps} />
            <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
              {step === 0 ? (
                <StepPanel
                  description={t('steps.productDetailsDescription')}
                  title={t('steps.productDetails')}
                >
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
                      searchPlaceholder={referenceSearchText(t('manufacturer'))}
                      value={form.manufacturerId}
                    />
                    <TextField
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
                </StepPanel>
              ) : null}
              {step === 1 ? (
                <StepPanel
                  description={t('steps.productMediaDescription')}
                  title={t('steps.productMedia')}
                >
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
                </StepPanel>
              ) : null}
              {step === 2 ? (
                <StepPanel
                  description={t('steps.productStockDescription')}
                  title={t('steps.productStock')}
                >
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
                      label={t('minAmount')}
                      onChange={(minAmount) =>
                        setForm((current) => ({ ...current, minAmount }))
                      }
                      placeholder={t('placeholders.minAmount')}
                      value={form.minAmount}
                    />
                    <NumberField
                      label={t('price')}
                      onChange={(price) =>
                        setForm((current) => ({ ...current, price }))
                      }
                      placeholder={t('placeholders.price')}
                      value={form.price}
                    />
                  </div>
                </StepPanel>
              ) : null}
              {step === 3 ? (
                <ReviewPanel
                  rows={[
                    [t('productName'), form.name],
                    [
                      t('category'),
                      labelFor(options?.categories, form.categoryId),
                    ],
                    [t('owner'), labelFor(options?.owners, form.ownerId)],
                    [
                      t('featuredImage'),
                      form.avatarUrl ? t('attached') : t('notSet'),
                    ],
                    [
                      t('steps.productStock'),
                      shouldCreateStockRow
                        ? form.unlimitedStock
                          ? t('unlimitedStock')
                          : t('limitedStock')
                        : t('notSet'),
                    ],
                    ...(shouldCreateStockRow
                      ? ([
                          [
                            t('warehouse'),
                            labelFor(options?.warehouses, form.warehouseId),
                          ],
                          [t('unit'), labelFor(options?.units, form.unitId)],
                          [
                            t('amount'),
                            form.unlimitedStock
                              ? t('unlimitedStock')
                              : form.amount || t('notSet'),
                          ],
                          [t('minAmount'), form.minAmount || t('notSet')],
                          [t('price'), form.price || t('notSet')],
                        ] satisfies [string, string][])
                      : []),
                  ]}
                />
              ) : null}
              <SmartSuggestions
                emptyLabel={t('suggestions.empty')}
                suggestions={suggestions}
                title={t('suggestions.title')}
              />
            </div>
            <StepperDialogFooter
              backLabel={t('back')}
              canContinue={canContinue}
              isFirstStep={step === 0}
              isLastStep={step === steps.length - 1}
              nextLabel={t('next')}
              onBack={() => setStep((current) => Math.max(0, current - 1))}
              onNext={() =>
                setStep((current) => Math.min(steps.length - 1, current + 1))
              }
              pending={mutation.isPending}
              pendingLabel={t('creating')}
              submitLabel={t('create')}
            />
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReviewPanel({ rows }: { rows: [string, string][] }) {
  const t = useTranslations('inventory.operator.forms');
  return (
    <StepPanel
      description={t('steps.reviewDescription')}
      title={t('steps.review')}
    >
      <ReviewRows rows={rows} />
    </StepPanel>
  );
}
