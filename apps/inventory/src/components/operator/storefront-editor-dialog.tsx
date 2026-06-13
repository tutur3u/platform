'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings2 } from '@tuturuuu/icons';
import {
  type InventoryStorefront,
  type InventoryStorefrontCheckoutMode,
  type InventoryStorefrontCornerStyle,
  type InventoryStorefrontLayoutStyle,
  type InventoryStorefrontStatus,
  type InventoryStorefrontSurfaceStyle,
  type InventoryStorefrontThemePreset,
  type InventoryStorefrontVisibility,
  updateInventoryStorefront,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { sanitizeStorefrontAccentColor } from '@tuturuuu/ui/storefront';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { InventoryImageUploadField } from './inventory-image-upload';
import { operatorDialogContentClassName } from './operator-dialog';
import {
  SelectValueField,
  TextAreaField,
  TextField,
  ToggleField,
} from './operator-form-fields';
import {
  checkoutModes,
  cornerStyles,
  layoutStyles,
  storefrontStatuses,
  storefrontVisibilities,
  surfaceStyles,
  themePresets,
} from './storefront-form-options';

export function StorefrontEditorDialog({
  storefront,
  wsId,
}: {
  storefront: InventoryStorefront;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => getInitialForm(storefront));
  const mutation = useMutation({
    mutationFn: () =>
      updateInventoryStorefront(wsId, storefront.id, {
        ...form,
        accentColor: sanitizeStorefrontAccentColor(form.accentColor),
        currency: form.currency.trim().toUpperCase() || 'USD',
        description: form.description || null,
        heroImageUrl: form.heroImageUrl || null,
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      setOpen(false);
      toast.success(t('saveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'storefront', storefront.id],
      });
    },
  });

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) setForm(getInitialForm(storefront));
        setOpen(nextOpen);
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button size="icon" type="button" variant="outline">
          <Settings2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className={operatorDialogContentClassName('large')}>
        <DialogHeader>
          <DialogTitle>{t('editStorefrontTitle')}</DialogTitle>
          <DialogDescription>
            {t('editStorefrontDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label={t('storeName')}
              onChange={(name) => setForm((current) => ({ ...current, name }))}
              placeholder={t('placeholders.storeName')}
              value={form.name}
            />
            <TextField
              label={t('slug')}
              onChange={(slug) => setForm((current) => ({ ...current, slug }))}
              placeholder={t('placeholders.slug')}
              value={form.slug}
            />
            <TextAreaField
              className="md:col-span-2"
              label={t('description')}
              onChange={(description) =>
                setForm((current) => ({ ...current, description }))
              }
              placeholder={t('placeholders.storeDescription')}
              value={form.description}
            />
            <div className="md:col-span-2">
              <InventoryImageUploadField
                description={t('heroImageDescription')}
                label={t('heroImageUrl')}
                onChange={(heroImageUrl) =>
                  setForm((current) => ({ ...current, heroImageUrl }))
                }
                target="storefront-hero"
                value={form.heroImageUrl}
                wsId={wsId}
              />
            </div>
            <TextField
              label={t('currency')}
              onChange={(currency) =>
                setForm((current) => ({ ...current, currency }))
              }
              placeholder={t('placeholders.currency')}
              value={form.currency}
            />
            <TextField
              label={t('accentColor')}
              onChange={(accentColor) =>
                setForm((current) => ({ ...current, accentColor }))
              }
              placeholder={t('placeholders.accentColor')}
              value={form.accentColor}
            />
            <SelectValueField
              label={t('status')}
              onChange={(status) =>
                setForm((current) => ({
                  ...current,
                  status: status as InventoryStorefrontStatus,
                }))
              }
              options={storefrontStatuses.map((value) => ({
                label: t(`storefrontStatus.${value}`),
                value,
              }))}
              placeholder={t('placeholders.status')}
              value={form.status}
            />
            <SelectValueField
              label={t('visibility')}
              onChange={(visibility) =>
                setForm((current) => ({
                  ...current,
                  visibility: visibility as InventoryStorefrontVisibility,
                }))
              }
              options={storefrontVisibilities.map((value) => ({
                label:
                  value === 'public'
                    ? t('visibilityPublic')
                    : t('visibilityPrivate'),
                value,
              }))}
              placeholder={t('placeholders.visibility')}
              value={form.visibility}
            />
            <SelectValueField
              label={t('checkoutMode')}
              onChange={(checkoutMode) =>
                setForm((current) => ({
                  ...current,
                  checkoutMode: checkoutMode as InventoryStorefrontCheckoutMode,
                }))
              }
              options={checkoutModes.map((value) => ({
                label: t(`checkoutModes.${value}`),
                value,
              }))}
              placeholder={t('placeholders.checkoutMode')}
              value={form.checkoutMode}
            />
            <SelectValueField
              label={t('themePreset')}
              onChange={(themePreset) =>
                setForm((current) => ({
                  ...current,
                  themePreset: themePreset as InventoryStorefrontThemePreset,
                }))
              }
              options={themePresets.map((value) => ({
                label: t(`themePresets.${value}`),
                value,
              }))}
              placeholder={t('placeholders.themePreset')}
              value={form.themePreset}
            />
            <SelectValueField
              label={t('layoutStyle')}
              onChange={(layoutStyle) =>
                setForm((current) => ({
                  ...current,
                  layoutStyle: layoutStyle as InventoryStorefrontLayoutStyle,
                }))
              }
              options={layoutStyles.map((value) => ({
                label: t(`layoutStyles.${value}`),
                value,
              }))}
              placeholder={t('placeholders.layoutStyle')}
              value={form.layoutStyle}
            />
            <SelectValueField
              label={t('surfaceStyle')}
              onChange={(surfaceStyle) =>
                setForm((current) => ({
                  ...current,
                  surfaceStyle: surfaceStyle as InventoryStorefrontSurfaceStyle,
                }))
              }
              options={surfaceStyles.map((value) => ({
                label: t(`surfaceStyles.${value}`),
                value,
              }))}
              placeholder={t('placeholders.surfaceStyle')}
              value={form.surfaceStyle}
            />
            <SelectValueField
              label={t('cornerStyle')}
              onChange={(cornerStyle) =>
                setForm((current) => ({
                  ...current,
                  cornerStyle: cornerStyle as InventoryStorefrontCornerStyle,
                }))
              }
              options={cornerStyles.map((value) => ({
                label: t(`cornerStyles.${value}`),
                value,
              }))}
              placeholder={t('placeholders.cornerStyle')}
              value={form.cornerStyle}
            />
            <div className="md:col-span-2">
              <ToggleField
                checked={form.showInventoryBadges}
                onChange={(showInventoryBadges) =>
                  setForm((current) => ({
                    ...current,
                    showInventoryBadges,
                  }))
                }
              >
                {t('showInventoryBadges')}
              </ToggleField>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!form.name || !form.slug || mutation.isPending}
              type="submit"
            >
              {mutation.isPending ? t('creating') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function getInitialForm(storefront: InventoryStorefront) {
  return {
    accentColor: storefront.accentColor ?? '',
    cornerStyle: storefront.cornerStyle,
    currency: storefront.currency,
    description: storefront.description ?? '',
    heroImageUrl: storefront.heroImageUrl ?? '',
    layoutStyle: storefront.layoutStyle,
    name: storefront.name,
    checkoutMode: storefront.checkoutMode,
    showInventoryBadges: storefront.showInventoryBadges,
    slug: storefront.slug,
    status: storefront.status,
    surfaceStyle: storefront.surfaceStyle,
    themePreset: storefront.themePreset,
    visibility: storefront.visibility,
  };
}
