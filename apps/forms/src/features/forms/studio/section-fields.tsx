'use client';

import { FileText, MessageSquare } from '@tuturuuu/icons';
import { useWatch } from '@tuturuuu/ui/hooks/use-form';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { FieldLabel } from '../form-icons';
import { FormsRichTextEditor } from '../forms-rich-text-editor';
import type { getFormToneClasses } from '../theme';
import { FormMediaField } from './form-media-field';
import type { StudioForm } from './studio-utils';

const EMPTY_MEDIA = { storagePath: '', url: '', alt: '' };

/**
 * A section's own title, description and cover.
 *
 * Extracted so the stacked layout's section accordion and the three-pane
 * properties column render the same fields rather than two implementations
 * that drift — the three-pane version previously had none at all, which meant
 * a section could be selected but not edited.
 *
 * Watches its own values instead of taking them as props, so a caller only
 * needs to say which section it is.
 */
export function SectionFields({
  wsId,
  form,
  sectionIndex,
  toneClasses,
}: {
  wsId: string;
  form: StudioForm;
  sectionIndex: number;
  toneClasses: ReturnType<typeof getFormToneClasses>;
}) {
  const t = useTranslations('forms');
  const title = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.title`,
  });
  const description = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.description`,
  });
  const image = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.image`,
  });

  return (
    <div className="grid gap-5">
      <div className="space-y-1.5">
        <Label className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          <FieldLabel icon={FileText}>{t('studio.section_title')}</FieldLabel>
        </Label>
        <FormsRichTextEditor
          value={title || ''}
          onChange={(nextValue) =>
            form.setValue(`sections.${sectionIndex}.title`, nextValue, {
              shouldDirty: true,
            })
          }
          toneClasses={toneClasses}
          compact
        />
      </div>

      <div className="space-y-1.5">
        <Label className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          <FieldLabel icon={MessageSquare}>
            {t('studio.section_description')}
          </FieldLabel>
        </Label>
        <FormsRichTextEditor
          value={description || ''}
          onChange={(nextValue) =>
            form.setValue(`sections.${sectionIndex}.description`, nextValue, {
              shouldDirty: true,
            })
          }
          placeholder={t('studio.section_description_hint')}
          toneClasses={toneClasses}
        />
      </div>

      <FormMediaField
        wsId={wsId}
        scope="section"
        value={image ?? EMPTY_MEDIA}
        onChange={(value) =>
          form.setValue(`sections.${sectionIndex}.image`, value, {
            shouldDirty: true,
          })
        }
        toneClasses={toneClasses}
        label={t('studio.section_image')}
        hint={t('studio.section_image_hint')}
      />
    </div>
  );
}
