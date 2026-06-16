'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Boxes, FileImage, Layers3, Tags } from '@tuturuuu/icons';
import type { InventoryProductSummary } from '@tuturuuu/internal-api/inventory';
import { createInventoryBundle } from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { MoneyInput } from '@tuturuuu/ui/money-input';
import { toast } from '@tuturuuu/ui/sonner';
import { majorToMinor } from '@tuturuuu/utils/money';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import {
  BundleComponentPicker,
  type DraftBundleComponent,
} from './bundle-component-picker';
import { InventoryImageUploadField } from './inventory-image-upload';
import {
  FormSection,
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';
import {
  FieldLabel,
  NumberField,
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
  // Price in integer minor units (cents) — the canonical storage unit.
  price: 0,
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
  const [open, setOpen] = useState(false);
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
        // Components are priced in whole major units, so the estimate fallback
        // is converted to minor units; an explicit price is already minor.
        price: form.price || majorToMinor(estimatedPrice, 'USD'),
        slug: form.slug,
        status: 'draft',
      }),
    onError: () => toast.error(t('createBundleError')),
    onSuccess: () => {
      setForm(initialForm);
      setComponents([]);
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
            price: majorToMinor(estimatedPrice, 'USD'),
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
        <OperatorDialogContent size="lg">
          <OperatorDialogHeader
            description={t('createBundleDescription')}
            title={t('createBundleTitle')}
          />
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (canSubmit) mutation.mutate();
            }}
          >
            <OperatorDialogBody className="grid gap-6">
              {suggestions.length ? (
                <SmartSuggestions
                  emptyLabel={t('suggestions.empty')}
                  suggestions={suggestions}
                  title={t('suggestions.title')}
                />
              ) : null}
              <FormSection
                description={t('steps.bundleDetailsDescription')}
                icon={<Tags className="h-4 w-4" />}
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
                    hint={t('hints.slug')}
                    label={t('slug')}
                    onChange={(slug) =>
                      setForm((current) => ({ ...current, slug }))
                    }
                    placeholder={t('placeholders.slug')}
                    value={form.slug}
                  />
                  <label className="grid min-w-0 gap-1 text-sm">
                    <FieldLabel hint={t('hints.price')} label={t('price')} />
                    <MoneyInput
                      currency="USD"
                      hideHelpers
                      onChange={(price) =>
                        setForm((current) => ({ ...current, price }))
                      }
                      placeholder={t('placeholders.price')}
                      value={form.price}
                    />
                  </label>
                  <NumberField
                    hint={t('hints.maxPerOrder')}
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
              </FormSection>
              <FormSection
                description={t('steps.bundleComponentsDescription')}
                icon={<Boxes className="h-4 w-4" />}
                title={t('steps.bundleComponents')}
              >
                <BundleComponentPicker
                  components={components}
                  onChange={setComponents}
                  products={products}
                />
              </FormSection>
              <FormSection
                description={t('steps.bundleMediaDescription')}
                icon={<FileImage className="h-4 w-4" />}
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
              </FormSection>
            </OperatorDialogBody>
            <OperatorDialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  {t('cancel')}
                </Button>
              </DialogClose>
              <Button disabled={!canSubmit || mutation.isPending} type="submit">
                {mutation.isPending ? t('creating') : t('create')}
              </Button>
            </OperatorDialogFooter>
          </form>
        </OperatorDialogContent>
      </Dialog>
    </div>
  );
}
