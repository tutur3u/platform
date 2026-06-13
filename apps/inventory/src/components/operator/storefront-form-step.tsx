'use client';

import type {
  InventoryStorefrontCheckoutMode,
  InventoryStorefrontCornerStyle,
  InventoryStorefrontLayoutStyle,
  InventoryStorefrontStatus,
  InventoryStorefrontSurfaceStyle,
  InventoryStorefrontThemePreset,
  InventoryStorefrontVisibility,
} from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';
import { StepPanel } from './form-stepper';
import { InventoryImageUploadField } from './inventory-image-upload';
import {
  ReviewRows,
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
import type {
  StorefrontFormSetter,
  StorefrontFormState,
} from './storefront-form-types';

export function StorefrontStep({
  form,
  setForm,
  step,
  wsId,
}: {
  form: StorefrontFormState;
  setForm: StorefrontFormSetter;
  step: number;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');

  if (step === 0) {
    return (
      <StepPanel
        description={t('steps.storefrontIdentityDescription')}
        title={t('steps.storefrontIdentity')}
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
        </div>
      </StepPanel>
    );
  }

  if (step === 1) {
    return (
      <StepPanel
        description={t('steps.storefrontBrandDescription')}
        title={t('steps.storefrontBrand')}
      >
        <div className="grid gap-3 md:grid-cols-2">
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
            label={t('accentColor')}
            onChange={(accentColor) =>
              setForm((current) => ({ ...current, accentColor }))
            }
            placeholder={t('placeholders.accentColor')}
            value={form.accentColor}
          />
          <TextField
            label={t('currency')}
            onChange={(currency) =>
              setForm((current) => ({ ...current, currency }))
            }
            placeholder={t('placeholders.currency')}
            value={form.currency}
          />
          <SelectValueField
            label={t('themePreset')}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                themePreset: value as InventoryStorefrontThemePreset,
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
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                layoutStyle: value as InventoryStorefrontLayoutStyle,
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
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                surfaceStyle: value as InventoryStorefrontSurfaceStyle,
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
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                cornerStyle: value as InventoryStorefrontCornerStyle,
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
                setForm((current) => ({ ...current, showInventoryBadges }))
              }
            >
              {t('showInventoryBadges')}
            </ToggleField>
          </div>
        </div>
      </StepPanel>
    );
  }

  if (step === 2) {
    return (
      <StepPanel
        description={t('steps.storefrontCheckoutDescription')}
        title={t('steps.storefrontCheckout')}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <SelectValueField
            label={t('checkoutMode')}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                checkoutMode: value as InventoryStorefrontCheckoutMode,
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
            label={t('status')}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                status: value as InventoryStorefrontStatus,
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
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                visibility: value as InventoryStorefrontVisibility,
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
        </div>
      </StepPanel>
    );
  }

  return (
    <StepPanel
      description={t('steps.reviewDescription')}
      title={t('steps.review')}
    >
      <ReviewRows
        rows={[
          [t('storeName'), form.name],
          [t('slug'), form.slug],
          [t('checkoutMode'), t(`checkoutModes.${form.checkoutMode}`)],
          [t('themePreset'), t(`themePresets.${form.themePreset}`)],
          [t('heroImageUrl'), form.heroImageUrl ? t('attached') : t('notSet')],
        ]}
      />
    </StepPanel>
  );
}
