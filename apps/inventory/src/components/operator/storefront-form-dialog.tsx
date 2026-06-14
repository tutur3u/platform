'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, CreditCard, FileImage, Store } from '@tuturuuu/icons';
import { createInventoryStorefront } from '@tuturuuu/internal-api/inventory';
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
import { sanitizeStorefrontAccentColor } from '@tuturuuu/ui/storefront';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { FormStepper, StepperDialogFooter } from './form-stepper';
import { operatorDialogContentClassName } from './operator-dialog';
import {
  createSlugSuggestion,
  type SmartSuggestion,
  SmartSuggestions,
} from './smart-suggestions';
import { StorefrontStep } from './storefront-form-step';
import type { StorefrontFormState } from './storefront-form-types';

const initialForm: StorefrontFormState = {
  accentColor: '',
  checkoutMode: 'simulated',
  cornerStyle: 'rounded',
  currency: 'USD',
  description: '',
  heroImageUrl: '',
  layoutStyle: 'grid',
  name: '',
  showInventoryBadges: true,
  slug: '',
  status: 'draft',
  surfaceStyle: 'solid',
  themePreset: 'minimal',
  visibility: 'public',
};

export function StorefrontForm({
  trigger,
  wsId,
}: {
  trigger?: ReactNode;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const steps = [
    {
      description: t('steps.storefrontIdentityDescription'),
      icon: Store,
      id: 'identity',
      title: t('steps.storefrontIdentity'),
    },
    {
      description: t('steps.storefrontBrandDescription'),
      icon: FileImage,
      id: 'brand',
      title: t('steps.storefrontBrand'),
    },
    {
      description: t('steps.storefrontCheckoutDescription'),
      icon: CreditCard,
      id: 'checkout',
      title: t('steps.storefrontCheckout'),
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
      createInventoryStorefront(wsId, {
        accentColor: sanitizeStorefrontAccentColor(form.accentColor),
        checkoutMode: form.checkoutMode,
        cornerStyle: form.cornerStyle,
        currency: form.currency.trim().toUpperCase() || 'USD',
        description: form.description || null,
        heroImageUrl: form.heroImageUrl || null,
        layoutStyle: form.layoutStyle,
        name: form.name,
        showInventoryBadges: form.showInventoryBadges,
        slug: form.slug,
        status: form.status,
        surfaceStyle: form.surfaceStyle,
        themePreset: form.themePreset,
        visibility: form.visibility,
      }),
    onError: () => toast.error(t('createStorefrontError')),
    onSuccess: () => {
      setForm(initialForm);
      setStep(0);
      setOpen(false);
      toast.success(t('createStorefrontSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });
  const canSubmit = Boolean(form.name && form.slug);
  const suggestions = useMemo<SmartSuggestion[]>(() => {
    const next: SmartSuggestion[] = [];
    if (!form.slug && form.name) {
      next.push({
        actionLabel: t('suggestions.apply'),
        description: t('suggestions.slugDescription'),
        key: 'storefront-slug',
        onApply: () =>
          setForm((current) => ({
            ...current,
            slug: createSlugSuggestion(current.name),
          })),
        title: t('suggestions.slugTitle'),
      });
    }
    if (!form.accentColor) {
      next.push({
        actionLabel: t('suggestions.apply'),
        description: t('suggestions.storefrontAccentDescription'),
        key: 'storefront-accent',
        onApply: () =>
          setForm((current) => ({ ...current, accentColor: '#111827' })),
        title: t('suggestions.storefrontAccentTitle'),
      });
    }
    if (form.checkoutMode === 'polar') {
      next.push({
        actionLabel: t('suggestions.apply'),
        description: t('suggestions.simulatedCheckoutDescription'),
        key: 'simulated-checkout',
        onApply: () =>
          setForm((current) => ({ ...current, checkoutMode: 'simulated' })),
        title: t('suggestions.simulatedCheckoutTitle'),
      });
    }
    return next;
  }, [form.accentColor, form.checkoutMode, form.name, form.slug, t]);

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
              <Store className="h-4 w-4" />
              {t('newStorefront')}
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className={operatorDialogContentClassName('workflow')}>
          <DialogHeader>
            <DialogTitle>{t('createStorefrontTitle')}</DialogTitle>
            <DialogDescription>
              {t('createStorefrontDescription')}
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
              <StorefrontStep
                form={form}
                setForm={setForm}
                step={step}
                wsId={wsId}
              />
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
