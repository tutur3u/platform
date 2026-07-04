'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, FileImage, LayoutGrid, Store } from '@tuturuuu/icons';
import { createInventoryStorefront } from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { sanitizeStorefrontAccentColor } from '@tuturuuu/ui/storefront';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import {
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
  OperatorDialogTabs,
} from './operator-dialog-shell';
import {
  createSlugSuggestion,
  type SmartSuggestion,
  SmartSuggestions,
} from './smart-suggestions';
import { createDefaultStorefrontSections } from './storefront-form-options';
import {
  StorefrontBrandFields,
  StorefrontBuilderFields,
  StorefrontCheckoutFields,
  StorefrontIdentityFields,
} from './storefront-form-step';
import type { StorefrontFormState } from './storefront-form-types';
import { useWorkspaceCurrency } from './workspace-currency';

const initialForm: StorefrontFormState = {
  accentColor: '',
  analyticsEnabled: true,
  checkoutMode: 'simulated',
  cornerStyle: 'rounded',
  coverImageUrl: '',
  currency: 'USD',
  description: '',
  heroImageUrl: '',
  layoutStyle: 'grid',
  name: '',
  polarEnvironment: 'sandbox',
  sections: createDefaultStorefrontSections(),
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
  const wsCurrency = useWorkspaceCurrency();
  const [form, setForm] = useState({ ...initialForm, currency: wsCurrency });
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      createInventoryStorefront(wsId, {
        accentColor: sanitizeStorefrontAccentColor(form.accentColor),
        analyticsEnabled: form.analyticsEnabled,
        checkoutMode: form.checkoutMode,
        cornerStyle: form.cornerStyle,
        coverImageUrl: form.coverImageUrl || null,
        currency: form.currency,
        description: form.description || null,
        heroImageUrl: form.heroImageUrl || null,
        layoutStyle: form.layoutStyle,
        name: form.name,
        polarEnvironment: form.polarEnvironment,
        sections: form.sections,
        showInventoryBadges: form.showInventoryBadges,
        slug: form.slug,
        status: form.status,
        surfaceStyle: form.surfaceStyle,
        themePreset: form.themePreset,
        visibility: form.visibility,
      }),
    onError: () => toast.error(t('createStorefrontError')),
    onSuccess: () => {
      setForm({ ...initialForm, currency: wsCurrency });
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
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger asChild>
          {trigger ?? (
            <Button type="button">
              <Store className="h-4 w-4" />
              {t('newStorefront')}
            </Button>
          )}
        </DialogTrigger>
        <OperatorDialogContent size="lg">
          <OperatorDialogHeader
            description={t('createStorefrontDescription')}
            title={t('createStorefrontTitle')}
          />
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) mutation.mutate();
            }}
          >
            <OperatorDialogTabs
              tabs={[
                {
                  content: (
                    <div className="grid gap-6">
                      <StorefrontIdentityFields
                        form={form}
                        setForm={setForm}
                        wsId={wsId}
                      />
                      <SmartSuggestions
                        emptyLabel={t('suggestions.empty')}
                        suggestions={suggestions}
                        title={t('suggestions.title')}
                      />
                    </div>
                  ),
                  icon: <Store className="h-4 w-4" />,
                  label: t('steps.storefrontIdentity'),
                  value: 'identity',
                },
                {
                  content: (
                    <StorefrontBrandFields
                      form={form}
                      setForm={setForm}
                      wsId={wsId}
                    />
                  ),
                  icon: <FileImage className="h-4 w-4" />,
                  label: t('steps.storefrontBrand'),
                  value: 'brand',
                },
                {
                  content: (
                    <StorefrontBuilderFields
                      form={form}
                      setForm={setForm}
                      wsId={wsId}
                    />
                  ),
                  icon: <LayoutGrid className="h-4 w-4" />,
                  label: t('steps.storefrontBuilder'),
                  value: 'builder',
                },
                {
                  content: (
                    <StorefrontCheckoutFields
                      form={form}
                      setForm={setForm}
                      wsId={wsId}
                    />
                  ),
                  icon: <CreditCard className="h-4 w-4" />,
                  label: t('steps.storefrontCheckout'),
                  value: 'checkout',
                },
              ]}
            />
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
