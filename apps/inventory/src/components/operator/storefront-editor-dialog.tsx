'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  FileImage,
  Palette,
  Settings2,
  Store,
} from '@tuturuuu/icons';
import {
  deleteInventoryStorefront,
  type InventoryPolarEnvironment,
  type InventoryStorefront,
  type InventoryStorefrontCheckoutMode,
  type InventoryStorefrontCornerStyle,
  type InventoryStorefrontLayoutStyle,
  type InventoryStorefrontSectionPayload,
  type InventoryStorefrontStatus,
  type InventoryStorefrontSurfaceStyle,
  type InventoryStorefrontThemePreset,
  type InventoryStorefrontVisibility,
  updateInventoryStorefront,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { sanitizeStorefrontAccentColor } from '@tuturuuu/ui/storefront';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { InventoryImageUploadField } from './inventory-image-upload';
import {
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
  OperatorDialogTabs,
} from './operator-dialog-shell';
import {
  ColorField,
  SelectValueField,
  TextAreaField,
  TextField,
  ToggleField,
} from './operator-form-fields';
import { LifecyclePanel } from './operator-lifecycle';
import {
  checkoutModes,
  cornerStyles,
  layoutStyles,
  polarCurrencyOptions,
  polarEnvironments,
  storefrontStatuses,
  storefrontVisibilities,
  surfaceStyles,
  themePresets,
} from './storefront-form-options';
import { StorefrontBuilderFields } from './storefront-form-step';
import type { StorefrontFormState } from './storefront-form-types';

export function StorefrontEditorDialog({
  onOpenChange: onOpenChangeProp,
  open: openProp,
  storefront,
  wsId,
}: {
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  storefront: InventoryStorefront;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChangeProp?.(next);
  };
  const [form, setForm] = useState(() => getInitialForm(storefront));
  const saveMutation = useMutation({
    mutationFn: () =>
      updateInventoryStorefront(wsId, storefront.id, {
        ...form,
        accentColor: sanitizeStorefrontAccentColor(form.accentColor),
        coverImageUrl: form.coverImageUrl || null,
        currency: form.currency,
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
  const archiveMutation = useMutation({
    mutationFn: () =>
      updateInventoryStorefront(wsId, storefront.id, { status: 'archived' }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      setOpen(false);
      toast.success(t('saveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteInventoryStorefront(wsId, storefront.id),
    onError: () => toast.error(t('deleteError')),
    onSuccess: () => {
      setOpen(false);
      toast.success(t('deleteSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });
  const submitSave = (event?: FormEvent) => {
    event?.preventDefault();
    if (!form.name || !form.slug) return;
    saveMutation.mutate();
  };
  const canSave = Boolean(form.name && form.slug);

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) setForm(getInitialForm(storefront));
        setOpen(nextOpen);
      }}
      open={open}
    >
      {isControlled ? null : (
        <DialogTrigger asChild>
          <Button size="sm" type="button" variant="outline">
            <Settings2 className="h-4 w-4" />
            {t('edit')}
          </Button>
        </DialogTrigger>
      )}
      <OperatorDialogContent mobileFullscreen size="lg">
        <OperatorDialogHeader
          description={t('editStorefrontDescription')}
          title={t('editStorefrontTitle')}
        />
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submitSave}>
          <OperatorDialogTabs
            tabs={[
              {
                content: (
                  <div className="grid min-w-0 gap-3 md:grid-cols-2">
                    <TextField
                      label={t('storeName')}
                      onChange={(name) =>
                        setForm((current) => ({ ...current, name }))
                      }
                      placeholder={t('placeholders.storeName')}
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
                    <TextAreaField
                      className="md:col-span-2"
                      label={t('description')}
                      onChange={(description) =>
                        setForm((current) => ({ ...current, description }))
                      }
                      placeholder={t('placeholders.storeDescription')}
                      value={form.description}
                    />
                  </div>
                ),
                icon: <Store className="h-4 w-4" />,
                label: t('tabs.details'),
                value: 'details',
              },
              {
                content: (
                  <div className="grid gap-3">
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
                    <InventoryImageUploadField
                      description={t('coverImageDescription')}
                      label={t('coverImage')}
                      onChange={(coverImageUrl) =>
                        setForm((current) => ({ ...current, coverImageUrl }))
                      }
                      target="storefront-cover"
                      value={form.coverImageUrl}
                      wsId={wsId}
                    />
                    <div className="grid min-w-0 gap-3 md:grid-cols-2">
                      <SelectValueField
                        allowEmpty={false}
                        hint={t('hints.currency')}
                        label={t('currency')}
                        onChange={(currency) =>
                          setForm((current) => ({ ...current, currency }))
                        }
                        options={polarCurrencyOptions}
                        placeholder={t('placeholders.currency')}
                        value={form.currency}
                      />
                      <ColorField
                        hint={t('hints.accentColor')}
                        label={t('accentColor')}
                        onChange={(accentColor) =>
                          setForm((current) => ({ ...current, accentColor }))
                        }
                        placeholder={t('placeholders.accentColor')}
                        value={form.accentColor}
                      />
                    </div>
                  </div>
                ),
                icon: <FileImage className="h-4 w-4" />,
                label: t('tabs.brand'),
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
                icon: <FileImage className="h-4 w-4" />,
                label: t('tabs.builder'),
                value: 'builder',
              },
              {
                content: (
                  <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <SelectValueField
                      hint={t('hints.themePreset')}
                      label={t('themePreset')}
                      onChange={(themePreset) =>
                        setForm((current) => ({
                          ...current,
                          themePreset:
                            themePreset as InventoryStorefrontThemePreset,
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
                      hint={t('hints.layoutStyle')}
                      label={t('layoutStyle')}
                      onChange={(layoutStyle) =>
                        setForm((current) => ({
                          ...current,
                          layoutStyle:
                            layoutStyle as InventoryStorefrontLayoutStyle,
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
                      hint={t('hints.surfaceStyle')}
                      label={t('surfaceStyle')}
                      onChange={(surfaceStyle) =>
                        setForm((current) => ({
                          ...current,
                          surfaceStyle:
                            surfaceStyle as InventoryStorefrontSurfaceStyle,
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
                      hint={t('hints.cornerStyle')}
                      label={t('cornerStyle')}
                      onChange={(cornerStyle) =>
                        setForm((current) => ({
                          ...current,
                          cornerStyle:
                            cornerStyle as InventoryStorefrontCornerStyle,
                        }))
                      }
                      options={cornerStyles.map((value) => ({
                        label: t(`cornerStyles.${value}`),
                        value,
                      }))}
                      placeholder={t('placeholders.cornerStyle')}
                      value={form.cornerStyle}
                    />
                  </div>
                ),
                icon: <Palette className="h-4 w-4" />,
                label: t('tabs.theme'),
                value: 'theme',
              },
              {
                content: (
                  <div className="grid min-w-0 gap-3 md:grid-cols-3">
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
                      hint={t('hints.visibility')}
                      label={t('visibility')}
                      onChange={(visibility) =>
                        setForm((current) => ({
                          ...current,
                          visibility:
                            visibility as InventoryStorefrontVisibility,
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
                      hint={t('hints.checkoutMode')}
                      label={t('checkoutMode')}
                      onChange={(checkoutMode) =>
                        setForm((current) => ({
                          ...current,
                          checkoutMode:
                            checkoutMode as InventoryStorefrontCheckoutMode,
                        }))
                      }
                      options={checkoutModes.map((value) => ({
                        label: t(`checkoutModes.${value}`),
                        value,
                      }))}
                      placeholder={t('placeholders.checkoutMode')}
                      value={form.checkoutMode}
                    />
                    {form.checkoutMode === 'polar' ? (
                      <SelectValueField
                        allowEmpty={false}
                        hint={t('hints.polarEnvironment')}
                        label={t('polarEnvironment')}
                        onChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            polarEnvironment:
                              value as InventoryPolarEnvironment,
                          }))
                        }
                        options={polarEnvironments.map((value) => ({
                          label: t(`polarEnvironments.${value}`),
                          value,
                        }))}
                        placeholder={t('polarEnvironment')}
                        value={form.polarEnvironment}
                      />
                    ) : null}
                    <div className="md:col-span-3">
                      <ToggleField
                        checked={form.showInventoryBadges}
                        hint={t('hints.showInventoryBadges')}
                        onChange={(showInventoryBadges) =>
                          setForm((current) => ({
                            ...current,
                            showInventoryBadges,
                          }))
                        }
                      >
                        {t('showInventoryBadges')}
                      </ToggleField>
                      <ToggleField
                        checked={form.analyticsEnabled}
                        hint={t('hints.analyticsEnabled')}
                        onChange={(analyticsEnabled) =>
                          setForm((current) => ({
                            ...current,
                            analyticsEnabled,
                          }))
                        }
                      >
                        {t('analyticsEnabled')}
                      </ToggleField>
                    </div>
                  </div>
                ),
                icon: <CreditCard className="h-4 w-4" />,
                label: t('tabs.checkout'),
                value: 'checkout',
              },
              {
                content: (
                  <LifecyclePanel
                    archivePending={archiveMutation.isPending}
                    deletePending={deleteMutation.isPending}
                    onArchive={() => archiveMutation.mutate()}
                    onDelete={() => deleteMutation.mutate()}
                    title={t('lifecycle')}
                  />
                ),
                icon: <Settings2 className="h-4 w-4" />,
                label: t('tabs.lifecycle'),
                value: 'lifecycle',
              },
            ]}
          />
          <OperatorDialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button disabled={!canSave || saveMutation.isPending} type="submit">
              {saveMutation.isPending ? t('saving') : t('save')}
            </Button>
          </OperatorDialogFooter>
        </form>
      </OperatorDialogContent>
    </Dialog>
  );
}

function getInitialForm(storefront: InventoryStorefront): StorefrontFormState {
  return {
    accentColor: storefront.accentColor ?? '',
    analyticsEnabled: storefront.analyticsEnabled,
    cornerStyle: storefront.cornerStyle,
    coverImageUrl: storefront.coverImageUrl ?? '',
    currency: storefront.currency,
    description: storefront.description ?? '',
    heroImageUrl: storefront.heroImageUrl ?? '',
    layoutStyle: storefront.layoutStyle,
    name: storefront.name,
    checkoutMode: storefront.checkoutMode,
    polarEnvironment: storefront.polarEnvironment ?? 'production',
    sections: sanitizeSections(storefront.sections),
    showInventoryBadges: storefront.showInventoryBadges,
    slug: storefront.slug,
    status: storefront.status,
    surfaceStyle: storefront.surfaceStyle,
    themePreset: storefront.themePreset,
    visibility: storefront.visibility,
  };
}

function sanitizeSections(
  sections: InventoryStorefront['sections']
): InventoryStorefrontSectionPayload[] {
  return sections.map((section) => ({
    description: section.description ?? '',
    href: section.href,
    imageUrl: section.imageUrl,
    items: section.items.map((item) => ({
      bundleId: item.bundleId,
      description: item.description,
      href: item.href,
      imageUrl: item.imageUrl,
      listingId: item.listingId,
      metadata: item.metadata,
      sortOrder: item.sortOrder,
      title: item.title,
    })),
    metadata: section.metadata,
    sectionType: section.sectionType,
    sortOrder: section.sortOrder,
    status: section.status,
    title: section.title ?? '',
  }));
}
