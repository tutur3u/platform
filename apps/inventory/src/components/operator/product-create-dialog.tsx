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
import { createInventoryProduct } from '@tuturuuu/internal-api/inventory';
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
import { type FormEvent, useState } from 'react';
import { FormStepper, StepPanel, StepperDialogFooter } from './form-stepper';
import { InventoryImageUploadField } from './inventory-image-upload';
import {
  labelFor,
  NumberField,
  ReviewRows,
  SelectField,
  TextAreaField,
  TextField,
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
  usage: '',
  warehouseId: '',
};

export function ProductCreateForm({
  options,
  wsId,
}: {
  options?: InventoryProductFormOptionsResponse;
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
  const mutation = useMutation({
    mutationFn: () =>
      createInventoryProduct(wsId, {
        avatar_url: form.avatarUrl || null,
        category_id: form.categoryId,
        description: form.description || undefined,
        inventory:
          form.unitId && form.warehouseId
            ? [
                {
                  amount: Number(form.amount || 0),
                  min_amount: Number(form.minAmount || 0),
                  price: Number(form.price || 0),
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
  const canContinue = step === 0 ? canSubmit : true;
  const suggestions = useProductSuggestions(form, setForm, options);

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
          <Button type="button">
            <PackagePlus className="h-4 w-4" />
            {t('newProduct')}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl">
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
              if (canSubmit) mutation.mutate();
            }}
          >
            <FormStepper activeIndex={step} steps={steps} />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
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
                      label={t('category')}
                      onChange={(categoryId) =>
                        setForm((current) => ({ ...current, categoryId }))
                      }
                      options={options?.categories}
                      placeholder={t('placeholders.category')}
                      value={form.categoryId}
                    />
                    <SelectField
                      label={t('owner')}
                      onChange={(ownerId) =>
                        setForm((current) => ({ ...current, ownerId }))
                      }
                      options={options?.owners}
                      placeholder={t('placeholders.owner')}
                      value={form.ownerId}
                    />
                    <SelectField
                      label={t('manufacturer')}
                      onChange={(manufacturerId) =>
                        setForm((current) => ({ ...current, manufacturerId }))
                      }
                      options={options?.manufacturers}
                      placeholder={t('placeholders.manufacturer')}
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
                    <SelectField
                      label={t('unit')}
                      onChange={(unitId) =>
                        setForm((current) => ({ ...current, unitId }))
                      }
                      options={options?.units}
                      placeholder={t('placeholders.unit')}
                      value={form.unitId}
                    />
                    <SelectField
                      label={t('warehouse')}
                      onChange={(warehouseId) =>
                        setForm((current) => ({ ...current, warehouseId }))
                      }
                      options={options?.warehouses}
                      placeholder={t('placeholders.warehouse')}
                      value={form.warehouseId}
                    />
                    <NumberField
                      label={t('amount')}
                      onChange={(amount) =>
                        setForm((current) => ({ ...current, amount }))
                      }
                      placeholder={t('placeholders.amount')}
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
                    [t('amount'), form.amount || t('notSet')],
                    [t('price'), form.price || t('notSet')],
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
