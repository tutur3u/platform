'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings2 } from '@tuturuuu/icons';
import {
  type InventoryStorefront,
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

const statuses: InventoryStorefrontStatus[] = ['draft', 'published', 'paused'];
const visibilities: InventoryStorefrontVisibility[] = ['public', 'private'];
const themePresets: InventoryStorefrontThemePreset[] = [
  'minimal',
  'editorial',
  'boutique',
  'catalog',
];
const layoutStyles: InventoryStorefrontLayoutStyle[] = [
  'grid',
  'list',
  'feature',
];
const surfaceStyles: InventoryStorefrontSurfaceStyle[] = [
  'solid',
  'soft',
  'glass',
];
const cornerStyles: InventoryStorefrontCornerStyle[] = [
  'compact',
  'rounded',
  'soft',
];

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
        <button
          className="inline-flex h-8 items-center rounded-md border border-border px-2"
          type="button"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
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
              value={form.name}
            />
            <TextField
              label={t('slug')}
              onChange={(slug) => setForm((current) => ({ ...current, slug }))}
              value={form.slug}
            />
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="font-medium">{t('description')}</span>
              <textarea
                className="min-h-20 rounded-md border border-input bg-background px-3 py-2"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                value={form.description}
              />
            </label>
            <TextField
              label={t('heroImageUrl')}
              onChange={(heroImageUrl) =>
                setForm((current) => ({ ...current, heroImageUrl }))
              }
              value={form.heroImageUrl}
            />
            <TextField
              label={t('currency')}
              onChange={(currency) =>
                setForm((current) => ({ ...current, currency }))
              }
              value={form.currency}
            />
            <TextField
              label={t('accentColor')}
              onChange={(accentColor) =>
                setForm((current) => ({ ...current, accentColor }))
              }
              placeholder="#7c3aed"
              value={form.accentColor}
            />
            <SelectField
              label={t('status')}
              onChange={(status) =>
                setForm((current) => ({
                  ...current,
                  status: status as InventoryStorefrontStatus,
                }))
              }
              options={statuses.map((value) => ({
                label: t(`storefrontStatus.${value}`),
                value,
              }))}
              value={form.status}
            />
            <SelectField
              label={t('visibility')}
              onChange={(visibility) =>
                setForm((current) => ({
                  ...current,
                  visibility: visibility as InventoryStorefrontVisibility,
                }))
              }
              options={visibilities.map((value) => ({
                label:
                  value === 'public'
                    ? t('visibilityPublic')
                    : t('visibilityPrivate'),
                value,
              }))}
              value={form.visibility}
            />
            <SelectField
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
              value={form.themePreset}
            />
            <SelectField
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
              value={form.layoutStyle}
            />
            <SelectField
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
              value={form.surfaceStyle}
            />
            <SelectField
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
              value={form.cornerStyle}
            />
            <label className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-2">
              <input
                checked={form.showInventoryBadges}
                className="h-4 w-4"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    showInventoryBadges: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>{t('showInventoryBadges')}</span>
            </label>
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
    showInventoryBadges: storefront.showInventoryBadges,
    slug: storefront.slug,
    status: storefront.status,
    surfaceStyle: storefront.surfaceStyle,
    themePreset: storefront.themePreset,
    visibility: storefront.visibility,
  };
}

function TextField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        className="h-10 rounded-md border border-input bg-background px-3"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        className="h-10 rounded-md border border-input bg-background px-3"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
