'use client';

import { Plus, Trash2 } from '@tuturuuu/icons';
import type {
  InventoryStorefrontCheckoutMode,
  InventoryStorefrontCornerStyle,
  InventoryStorefrontLayoutStyle,
  InventoryStorefrontSectionPayload,
  InventoryStorefrontSectionStatus,
  InventoryStorefrontSectionType,
  InventoryStorefrontStatus,
  InventoryStorefrontSurfaceStyle,
  InventoryStorefrontThemePreset,
  InventoryStorefrontVisibility,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { InventoryImageUploadField } from './inventory-image-upload';
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
  polarCurrencyOptions,
  storefrontStatuses,
  storefrontVisibilities,
  surfaceStyles,
  themePresets,
} from './storefront-form-options';
import type {
  StorefrontFormSetter,
  StorefrontFormState,
} from './storefront-form-types';

const sectionTypes: InventoryStorefrontSectionType[] = [
  'cover',
  'featured_banners',
  'featured_listings',
  'product_grid',
  'promo',
  'text',
];

const sectionStatuses: InventoryStorefrontSectionStatus[] = [
  'published',
  'hidden',
  'draft',
];

type StepFieldsProps = {
  form: StorefrontFormState;
  setForm: StorefrontFormSetter;
  wsId: string;
};

export function StorefrontIdentityFields({ form, setForm }: StepFieldsProps) {
  const t = useTranslations('inventory.operator.forms');

  return (
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
  );
}

export function StorefrontBrandFields({
  form,
  setForm,
  wsId,
}: StepFieldsProps) {
  const t = useTranslations('inventory.operator.forms');

  return (
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
      <div className="md:col-span-2">
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
      </div>
      <TextField
        label={t('accentColor')}
        onChange={(accentColor) =>
          setForm((current) => ({ ...current, accentColor }))
        }
        placeholder={t('placeholders.accentColor')}
        value={form.accentColor}
      />
      <SelectValueField
        allowEmpty={false}
        label={t('currency')}
        onChange={(currency) =>
          setForm((current) => ({ ...current, currency }))
        }
        options={polarCurrencyOptions}
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
      <div className="md:col-span-2">
        <ToggleField
          checked={form.analyticsEnabled}
          onChange={(analyticsEnabled) =>
            setForm((current) => ({ ...current, analyticsEnabled }))
          }
        >
          {t('analyticsEnabled')}
        </ToggleField>
      </div>
    </div>
  );
}

export function StorefrontBuilderFields({
  form,
  setForm,
  wsId,
}: StepFieldsProps) {
  const t = useTranslations('inventory.operator.forms');

  const updateSection = (
    index: number,
    patch: Partial<InventoryStorefrontSectionPayload>
  ) => {
    setForm((current) => ({
      ...current,
      sections: current.sections.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...patch } : section
      ),
    }));
  };

  const addSection = () => {
    setForm((current) => ({
      ...current,
      sections: [
        ...current.sections,
        {
          description: '',
          href: null,
          imageUrl: null,
          items: [],
          sectionType: 'promo',
          sortOrder: current.sections.length,
          status: 'published',
          title: '',
        },
      ],
    }));
  };

  const removeSection = (index: number) => {
    setForm((current) => ({
      ...current,
      sections: current.sections
        .filter((_, sectionIndex) => sectionIndex !== index)
        .map((section, sectionIndex) => ({
          ...section,
          sortOrder: sectionIndex,
        })),
    }));
  };

  return (
    <div className="grid gap-3">
      {form.sections.map((section, index) => (
        <section
          className="grid gap-3 rounded-lg border border-border bg-muted/15 p-3"
          key={`${section.sectionType}-${index}`}
        >
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-sm">
              {t('builderSection', { index: index + 1 })}
            </p>
            <Button
              onClick={() => removeSection(index)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4" />
              {t('removeSection')}
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <SelectValueField
              allowEmpty={false}
              label={t('sectionType')}
              onChange={(sectionType) =>
                updateSection(index, {
                  sectionType: sectionType as InventoryStorefrontSectionType,
                })
              }
              options={sectionTypes.map((value) => ({
                label: t(`sectionTypes.${value}`),
                value,
              }))}
              placeholder={t('placeholders.sectionType')}
              value={section.sectionType}
            />
            <SelectValueField
              allowEmpty={false}
              label={t('sectionStatus')}
              onChange={(status) =>
                updateSection(index, {
                  status: status as InventoryStorefrontSectionStatus,
                })
              }
              options={sectionStatuses.map((value) => ({
                label: t(`sectionStatuses.${value}`),
                value,
              }))}
              placeholder={t('placeholders.sectionStatus')}
              value={section.status ?? 'published'}
            />
            <TextField
              label={t('sectionTitle')}
              onChange={(title) => updateSection(index, { title })}
              placeholder={t('placeholders.sectionTitle')}
              value={section.title ?? ''}
            />
            <TextField
              inputMode="url"
              label={t('sectionHref')}
              onChange={(href) => updateSection(index, { href: href || null })}
              placeholder={t('placeholders.sectionHref')}
              value={section.href ?? ''}
            />
            <TextAreaField
              className="md:col-span-2"
              label={t('sectionDescription')}
              onChange={(description) => updateSection(index, { description })}
              placeholder={t('placeholders.sectionDescription')}
              value={section.description ?? ''}
            />
            <div className="md:col-span-2">
              <InventoryImageUploadField
                description={t('sectionImageDescription')}
                label={t('sectionImage')}
                onChange={(imageUrl) =>
                  updateSection(index, { imageUrl: imageUrl || null })
                }
                target="storefront-banner"
                value={section.imageUrl ?? ''}
                wsId={wsId}
              />
            </div>
          </div>
        </section>
      ))}
      <Button
        className="w-fit"
        onClick={addSection}
        type="button"
        variant="outline"
      >
        <Plus className="h-4 w-4" />
        {t('addSection')}
      </Button>
    </div>
  );
}

export function StorefrontCheckoutFields({ form, setForm }: StepFieldsProps) {
  const t = useTranslations('inventory.operator.forms');

  return (
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
            value === 'public' ? t('visibilityPublic') : t('visibilityPrivate'),
          value,
        }))}
        placeholder={t('placeholders.visibility')}
        value={form.visibility}
      />
    </div>
  );
}
