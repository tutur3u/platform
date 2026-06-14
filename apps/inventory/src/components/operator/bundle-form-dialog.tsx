'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Boxes,
  ClipboardCheck,
  FileImage,
  Layers3,
  Tags,
} from '@tuturuuu/icons';
import type { InventoryProductSummary } from '@tuturuuu/internal-api/inventory';
import { createInventoryBundle } from '@tuturuuu/internal-api/inventory';
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
import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import {
  BundleComponentPicker,
  type DraftBundleComponent,
} from './bundle-component-picker';
import { FormStepper, StepPanel, StepperDialogFooter } from './form-stepper';
import { InventoryImageUploadField } from './inventory-image-upload';
import { operatorDialogContentClassName } from './operator-dialog';
import {
  NumberField,
  ReviewRows,
  TextAreaField,
  TextField,
} from './operator-form-fields';
import {
  createSlugSuggestion,
  type SmartSuggestion,
  SmartSuggestions,
} from './smart-suggestions';

const initialForm = {
  description: '',
  imageUrl: '',
  maxPerOrder: '99',
  name: '',
  price: '',
  slug: '',
};

export function BundleForm({
  products,
  trigger,
  wsId,
}: {
  products: InventoryProductSummary[];
  trigger?: ReactNode;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [components, setComponents] = useState<DraftBundleComponent[]>([]);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const steps = [
    {
      description: t('steps.bundleDetailsDescription'),
      icon: Tags,
      id: 'details',
      title: t('steps.bundleDetails'),
    },
    {
      description: t('steps.bundleComponentsDescription'),
      icon: Boxes,
      id: 'components',
      title: t('steps.bundleComponents'),
    },
    {
      description: t('steps.bundleMediaDescription'),
      icon: FileImage,
      id: 'media',
      title: t('steps.bundleMedia'),
    },
    {
      description: t('steps.reviewDescription'),
      icon: ClipboardCheck,
      id: 'review',
      title: t('steps.review'),
    },
  ];
  const estimatedPrice = useMemo(
    () =>
      components.reduce(
        (total, component) => total + component.unitPrice * component.quantity,
        0
      ),
    [components]
  );
  const mutation = useMutation({
    mutationFn: () =>
      createInventoryBundle(wsId, {
        components: components.map((component) => ({
          productId: component.productId,
          quantity: component.quantity,
          unitId: component.unitId,
          warehouseId: component.warehouseId,
        })),
        description: form.description || null,
        imageUrl: form.imageUrl || null,
        maxPerOrder: Number(form.maxPerOrder || 99),
        name: form.name,
        price: Number(form.price || estimatedPrice || 0),
        slug: form.slug,
        status: 'draft',
      }),
    onError: () => toast.error(t('createBundleError')),
    onSuccess: () => {
      setForm(initialForm);
      setComponents([]);
      setStep(0);
      setOpen(false);
      toast.success(t('createBundleSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });
  const suggestions = useMemo<SmartSuggestion[]>(() => {
    const next: SmartSuggestion[] = [];
    if (!form.slug && form.name) {
      next.push({
        actionLabel: t('suggestions.apply'),
        description: t('suggestions.slugDescription'),
        key: 'slug',
        onApply: () =>
          setForm((current) => ({
            ...current,
            slug: createSlugSuggestion(current.name),
          })),
        title: t('suggestions.slugTitle'),
      });
    }
    if (estimatedPrice > 0 && !form.price) {
      next.push({
        actionLabel: t('suggestions.apply'),
        description: t('suggestions.bundlePriceDescription'),
        key: 'price',
        onApply: () =>
          setForm((current) => ({
            ...current,
            price: String(Math.round(estimatedPrice)),
          })),
        title: t('suggestions.bundlePriceTitle'),
      });
    }
    if (products.length && !components.length) {
      next.push({
        description: t('suggestions.bundleComponentsHint'),
        key: 'components',
        title: t('suggestions.bundleComponentsTitle'),
      });
    }
    return next;
  }, [
    components.length,
    estimatedPrice,
    form.name,
    form.price,
    form.slug,
    products.length,
    t,
  ]);
  const canSubmit = Boolean(form.name && form.slug);

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
            <Button type="button" variant="secondary">
              <Layers3 className="h-4 w-4" />
              {t('newBundle')}
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className={operatorDialogContentClassName('workflow')}>
          <DialogHeader>
            <DialogTitle>{t('createBundleTitle')}</DialogTitle>
            <DialogDescription>
              {t('createBundleDescription')}
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
                  description={t('steps.bundleDetailsDescription')}
                  title={t('steps.bundleDetails')}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <TextField
                      label={t('bundleName')}
                      onChange={(name) =>
                        setForm((current) => ({ ...current, name }))
                      }
                      placeholder={t('placeholders.bundleName')}
                      value={form.name}
                    />
                    <TextField
                      label={t('slug')}
                      onChange={(slug) =>
                        setForm((current) => ({ ...current, slug }))
                      }
                      placeholder={t('placeholders.slug')}
                      value={form.slug}
                    />
                    <NumberField
                      label={t('price')}
                      onChange={(price) =>
                        setForm((current) => ({ ...current, price }))
                      }
                      placeholder={t('placeholders.price')}
                      value={form.price}
                    />
                    <NumberField
                      label={t('maxPerOrder')}
                      onChange={(maxPerOrder) =>
                        setForm((current) => ({ ...current, maxPerOrder }))
                      }
                      placeholder={t('placeholders.maxPerOrder')}
                      value={form.maxPerOrder}
                    />
                    <TextAreaField
                      className="md:col-span-2"
                      label={t('description')}
                      onChange={(description) =>
                        setForm((current) => ({ ...current, description }))
                      }
                      placeholder={t('placeholders.bundleDescription')}
                      value={form.description}
                    />
                  </div>
                </StepPanel>
              ) : null}
              {step === 1 ? (
                <StepPanel
                  description={t('steps.bundleComponentsDescription')}
                  title={t('steps.bundleComponents')}
                >
                  <BundleComponentPicker
                    components={components}
                    onChange={setComponents}
                    products={products}
                  />
                </StepPanel>
              ) : null}
              {step === 2 ? (
                <StepPanel
                  description={t('steps.bundleMediaDescription')}
                  title={t('steps.bundleMedia')}
                >
                  <InventoryImageUploadField
                    description={t('bundleImageDescription')}
                    label={t('bundleImage')}
                    onChange={(imageUrl) =>
                      setForm((current) => ({ ...current, imageUrl }))
                    }
                    target="bundle-image"
                    value={form.imageUrl}
                    wsId={wsId}
                  />
                </StepPanel>
              ) : null}
              {step === 3 ? (
                <StepPanel
                  description={t('steps.reviewDescription')}
                  title={t('steps.review')}
                >
                  <ReviewRows
                    rows={[
                      [t('bundleName'), form.name],
                      [t('slug'), form.slug],
                      [
                        t('price'),
                        form.price || String(Math.round(estimatedPrice)),
                      ],
                      [t('components'), String(components.length)],
                    ]}
                    termWidthClassName="sm:grid-cols-[140px_1fr]"
                  />
                </StepPanel>
              ) : null}
              <SmartSuggestions
                emptyLabel={t('suggestions.empty')}
                suggestions={suggestions}
                title={t('suggestions.title')}
              />
            </div>
            <StepperDialogFooter
              backLabel={t('back')}
              canContinue={step === 0 ? canSubmit : true}
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
