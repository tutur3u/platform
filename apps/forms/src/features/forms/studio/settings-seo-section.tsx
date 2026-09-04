'use client';

import { Globe2, Search } from '@tuturuuu/icons';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { useWatch } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { FieldLabel } from '../form-icons';
import {
  FORM_SEO_DESCRIPTION_MAX_LENGTH,
  FORM_SEO_KEYWORDS_MAX_COUNT,
  FORM_SEO_TITLE_MAX_LENGTH,
} from '../schema';
import type { getFormToneClasses } from '../theme';
import { FormMediaField } from './form-media-field';
import { SearchResultPreview } from './seo-preview';
import { SettingsSection } from './settings-section';
import type { StudioForm } from './studio-utils';

/**
 * Keywords are stored as an array but edited as one comma-separated line: a
 * repeatable row editor is a lot of interface for a field most authors leave
 * empty, and the array is what the metadata layer wants.
 */
function parseKeywords(value: string) {
  return [
    ...new Set(
      value
        .split(',')
        .map((keyword) => keyword.trim())
        .filter(Boolean)
    ),
  ].slice(0, FORM_SEO_KEYWORDS_MAX_COUNT);
}

/**
 * Search and social metadata for the public form page.
 *
 * Every field is an override: left empty, the value is derived from the form's
 * own title, description and generated social card, which is what happened
 * before this panel existed. The preview shows the resolved result rather than
 * the raw override, so an empty field visibly falls back instead of looking
 * broken.
 */
export function SeoSettingsSection({
  form,
  shareCode,
  toneClasses,
  wsId,
}: {
  form: StudioForm;
  shareCode?: string | null;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  wsId: string;
}) {
  const t = useTranslations('forms');

  const formTitle = useWatch({ control: form.control, name: 'title' });
  const formDescription = useWatch({
    control: form.control,
    name: 'description',
  });
  const coverHeadline = useWatch({
    control: form.control,
    name: 'theme.coverHeadline',
  });
  const seoTitle = useWatch({ control: form.control, name: 'seo.title' });
  const seoDescription = useWatch({
    control: form.control,
    name: 'seo.description',
  });
  const keywords = useWatch({ control: form.control, name: 'seo.keywords' });
  const noIndex = useWatch({ control: form.control, name: 'seo.noIndex' });
  const seoImage = useWatch({ control: form.control, name: 'seo.image' });

  return (
    <SettingsSection
      description={t('settings.seo_description')}
      icon={Search}
      title={t('settings.seo')}
      value="seo"
    >
      <SearchResultPreview
        description={seoDescription || formDescription}
        fallbackDescription={t('shared.metadata_fallback_description')}
        fallbackTitle={t('shared.metadata_fallback_title')}
        shareCode={shareCode}
        title={seoTitle || coverHeadline || formTitle}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="seo-title">
            <FieldLabel icon={Search}>{t('settings.seo_title')}</FieldLabel>
          </Label>
          <Input
            id="seo-title"
            maxLength={FORM_SEO_TITLE_MAX_LENGTH}
            placeholder={t('settings.seo_title_placeholder')}
            {...form.register('seo.title')}
          />
          <p className="text-muted-foreground text-xs">
            {t('settings.seo_title_hint')}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="seo-canonical">
            <FieldLabel icon={Globe2}>{t('settings.seo_canonical')}</FieldLabel>
          </Label>
          <Input
            id="seo-canonical"
            inputMode="url"
            placeholder="https://example.com/apply"
            {...form.register('seo.canonicalUrl')}
          />
          <p className="text-muted-foreground text-xs">
            {t('settings.seo_canonical_hint')}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="seo-description">
          <FieldLabel icon={Search}>
            {t('settings.seo_meta_description')}
          </FieldLabel>
        </Label>
        <Textarea
          id="seo-description"
          maxLength={FORM_SEO_DESCRIPTION_MAX_LENGTH}
          placeholder={t('settings.seo_meta_description_placeholder')}
          rows={3}
          {...form.register('seo.description')}
        />
        <p className="text-muted-foreground text-xs">
          {t('settings.seo_meta_description_hint')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="seo-keywords">
          <FieldLabel icon={Search}>{t('settings.seo_keywords')}</FieldLabel>
        </Label>
        <Input
          id="seo-keywords"
          onChange={(event) =>
            form.setValue('seo.keywords', parseKeywords(event.target.value), {
              shouldDirty: true,
            })
          }
          placeholder={t('settings.seo_keywords_placeholder')}
          value={(keywords ?? []).join(', ')}
        />
        <p className="text-muted-foreground text-xs">
          {t('settings.seo_keywords_hint', {
            max: FORM_SEO_KEYWORDS_MAX_COUNT,
          })}
        </p>
      </div>

      <FormMediaField
        hint={t('settings.seo_image_hint')}
        label={t('settings.seo_image')}
        onChange={(value) =>
          form.setValue('seo.image', value, { shouldDirty: true })
        }
        scope="social"
        toneClasses={toneClasses}
        value={seoImage}
        wsId={wsId}
      />

      <button
        className={cn(
          'flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
          noIndex
            ? 'border-dynamic-orange/35 bg-dynamic-orange/8'
            : 'border-border/60 bg-background/55'
        )}
        onClick={() =>
          form.setValue('seo.noIndex', !noIndex, { shouldDirty: true })
        }
        type="button"
      >
        <Checkbox
          checked={noIndex}
          className="pointer-events-none mt-0.5"
          tabIndex={-1}
        />
        <span className="space-y-1">
          <span className="block font-medium text-sm">
            {t('settings.seo_no_index')}
          </span>
          <span className="block text-muted-foreground text-xs">
            {t('settings.seo_no_index_hint')}
          </span>
        </span>
      </button>
    </SettingsSection>
  );
}
