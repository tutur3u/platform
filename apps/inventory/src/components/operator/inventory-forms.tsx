'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers3, Store } from '@tuturuuu/icons';
import {
  createInventoryBundle,
  createInventoryStorefront,
  type InventoryStorefrontCheckoutMode,
  type InventoryStorefrontCornerStyle,
  type InventoryStorefrontLayoutStyle,
  type InventoryStorefrontStatus,
  type InventoryStorefrontSurfaceStyle,
  type InventoryStorefrontThemePreset,
  type InventoryStorefrontVisibility,
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

const storefrontStatuses: InventoryStorefrontStatus[] = [
  'draft',
  'published',
  'paused',
];
const storefrontVisibilities: InventoryStorefrontVisibility[] = [
  'public',
  'private',
];
const checkoutModes: InventoryStorefrontCheckoutMode[] = [
  'polar',
  'simulated',
  'disabled',
];
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

export function StorefrontForm({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [accentColor, setAccentColor] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [status, setStatus] = useState<InventoryStorefrontStatus>('draft');
  const [visibility, setVisibility] =
    useState<InventoryStorefrontVisibility>('public');
  const [checkoutMode, setCheckoutMode] =
    useState<InventoryStorefrontCheckoutMode>('simulated');
  const [themePreset, setThemePreset] =
    useState<InventoryStorefrontThemePreset>('minimal');
  const [layoutStyle, setLayoutStyle] =
    useState<InventoryStorefrontLayoutStyle>('grid');
  const [surfaceStyle, setSurfaceStyle] =
    useState<InventoryStorefrontSurfaceStyle>('solid');
  const [cornerStyle, setCornerStyle] =
    useState<InventoryStorefrontCornerStyle>('rounded');
  const [showInventoryBadges, setShowInventoryBadges] = useState(true);
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      createInventoryStorefront(wsId, {
        accentColor: sanitizeStorefrontAccentColor(accentColor),
        checkoutMode,
        cornerStyle,
        currency: currency.trim().toUpperCase() || 'USD',
        description: description || null,
        heroImageUrl: heroImageUrl || null,
        layoutStyle,
        name,
        slug,
        showInventoryBadges,
        status,
        surfaceStyle,
        themePreset,
        visibility,
      }),
    onError: () => toast.error(t('forms.createStorefrontError')),
    onSuccess: () => {
      setName('');
      setSlug('');
      setDescription('');
      setHeroImageUrl('');
      setAccentColor('');
      setCurrency('USD');
      setStatus('draft');
      setVisibility('public');
      setCheckoutMode('simulated');
      setThemePreset('minimal');
      setLayoutStyle('grid');
      setSurfaceStyle('solid');
      setCornerStyle('rounded');
      setShowInventoryBadges(true);
      setOpen(false);
      toast.success(t('forms.createStorefrontSuccess'));
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'storefronts'],
      });
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'overview'],
      });
    },
  });
  const canCreate = Boolean(name && slug);

  return (
    <div className="flex justify-end">
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger asChild>
          <Button type="button">
            <Store className="h-4 w-4" />
            {t('forms.newStorefront')}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('forms.createStorefrontTitle')}</DialogTitle>
            <DialogDescription>
              {t('forms.createStorefrontDescription')}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (canCreate) mutation.mutate();
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <TextField
                label={t('forms.storeName')}
                onChange={setName}
                value={name}
              />
              <TextField
                label={t('forms.slug')}
                onChange={setSlug}
                value={slug}
              />
              <label className="grid gap-1 text-sm md:col-span-2">
                <span className="font-medium">{t('forms.description')}</span>
                <textarea
                  className="min-h-20 rounded-md border border-input bg-background px-3 py-2"
                  onChange={(event) => setDescription(event.target.value)}
                  value={description}
                />
              </label>
              <TextField
                label={t('forms.heroImageUrl')}
                onChange={setHeroImageUrl}
                value={heroImageUrl}
              />
              <TextField
                label={t('forms.currency')}
                onChange={setCurrency}
                value={currency}
              />
              <TextField
                label={t('forms.accentColor')}
                onChange={setAccentColor}
                placeholder="#7c3aed"
                value={accentColor}
              />
              <SelectValueField
                label={t('forms.status')}
                onChange={(value) =>
                  setStatus(value as InventoryStorefrontStatus)
                }
                options={storefrontStatuses.map((value) => ({
                  label: t(`forms.storefrontStatus.${value}`),
                  value,
                }))}
                value={status}
              />
              <SelectValueField
                label={t('forms.visibility')}
                onChange={(value) =>
                  setVisibility(value as InventoryStorefrontVisibility)
                }
                options={storefrontVisibilities.map((value) => ({
                  label:
                    value === 'public'
                      ? t('forms.visibilityPublic')
                      : t('forms.visibilityPrivate'),
                  value,
                }))}
                value={visibility}
              />
              <SelectValueField
                label={t('forms.checkoutMode')}
                onChange={(value) =>
                  setCheckoutMode(value as InventoryStorefrontCheckoutMode)
                }
                options={checkoutModes.map((value) => ({
                  label: t(`forms.checkoutModes.${value}`),
                  value,
                }))}
                value={checkoutMode}
              />
              <SelectValueField
                label={t('forms.themePreset')}
                onChange={(value) =>
                  setThemePreset(value as InventoryStorefrontThemePreset)
                }
                options={themePresets.map((value) => ({
                  label: t(`forms.themePresets.${value}`),
                  value,
                }))}
                value={themePreset}
              />
              <SelectValueField
                label={t('forms.layoutStyle')}
                onChange={(value) =>
                  setLayoutStyle(value as InventoryStorefrontLayoutStyle)
                }
                options={layoutStyles.map((value) => ({
                  label: t(`forms.layoutStyles.${value}`),
                  value,
                }))}
                value={layoutStyle}
              />
              <SelectValueField
                label={t('forms.surfaceStyle')}
                onChange={(value) =>
                  setSurfaceStyle(value as InventoryStorefrontSurfaceStyle)
                }
                options={surfaceStyles.map((value) => ({
                  label: t(`forms.surfaceStyles.${value}`),
                  value,
                }))}
                value={surfaceStyle}
              />
              <SelectValueField
                label={t('forms.cornerStyle')}
                onChange={(value) =>
                  setCornerStyle(value as InventoryStorefrontCornerStyle)
                }
                options={cornerStyles.map((value) => ({
                  label: t(`forms.cornerStyles.${value}`),
                  value,
                }))}
                value={cornerStyle}
              />
              <label className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-2">
                <input
                  checked={showInventoryBadges}
                  className="h-4 w-4"
                  onChange={(event) =>
                    setShowInventoryBadges(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>{t('forms.showInventoryBadges')}</span>
              </label>
            </div>
            <DialogFooter>
              <Button disabled={!canCreate || mutation.isPending} type="submit">
                {mutation.isPending ? t('forms.creating') : t('forms.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function BundleForm({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [price, setPrice] = useState('');
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      createInventoryBundle(wsId, {
        name,
        price: Number(price || 0),
        slug,
        status: 'draft',
      }),
    onError: () => toast.error(t('forms.createBundleError')),
    onSuccess: () => {
      setName('');
      setSlug('');
      setPrice('');
      setOpen(false);
      toast.success(t('forms.createBundleSuccess'));
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'bundles'],
      });
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'overview'],
      });
    },
  });

  return (
    <div className="flex justify-end">
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger asChild>
          <Button type="button" variant="secondary">
            <Layers3 className="h-4 w-4" />
            {t('forms.newBundle')}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('forms.createBundleTitle')}</DialogTitle>
            <DialogDescription>
              {t('forms.createBundleDescription')}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            <TextField
              label={t('forms.bundleName')}
              onChange={setName}
              value={name}
            />
            <TextField
              label={t('forms.slug')}
              onChange={setSlug}
              value={slug}
            />
            <TextField
              inputMode="numeric"
              label={t('forms.price')}
              onChange={setPrice}
              value={price}
            />
            <DialogFooter>
              <Button
                disabled={!name || !slug || mutation.isPending}
                type="submit"
              >
                {mutation.isPending ? t('forms.creating') : t('forms.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TextField({
  inputMode,
  label,
  onChange,
  placeholder,
  value,
}: {
  inputMode?:
    | 'decimal'
    | 'email'
    | 'numeric'
    | 'search'
    | 'tel'
    | 'text'
    | 'url';
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
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function SelectValueField({
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
