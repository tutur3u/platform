'use client';

import { Flag, ListChecks, Star } from '@tuturuuu/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';

import { FieldLabel } from '../form-icons';
import { FormsRichTextEditor } from '../forms-rich-text-editor';
import type { FormQuestionInput } from '../schema';
import type { getFormToneClasses } from '../theme';
import type { FormsTranslator } from './studio-translator';
import type { StudioForm } from './studio-utils';

export function renderQuestionEditorScaleSettings({
  t,
  form,
  sectionIndex,
  questionIndex,
  toneClasses,
  minLabel,
  maxLabel,
  isRating,
  scaleMin,
  scaleMax,
  ratingMax,
  optionsArray,
  watchedOptions,
}: {
  t: FormsTranslator;
  form: StudioForm;
  sectionIndex: number;
  questionIndex: number;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  minLabel: string | null | undefined;
  maxLabel: string | null | undefined;
  isRating: boolean;
  scaleMin: number | null | undefined;
  scaleMax: number | null | undefined;
  ratingMax: number | null | undefined;
  optionsArray: {
    fields: Array<{ id: string }>;
  };
  watchedOptions: FormQuestionInput['options'] | undefined;
}) {
  return (
    <div className="grid gap-3 rounded-[1.35rem] border border-border/60 bg-muted/20 p-3 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label>
          <FieldLabel icon={Flag}>{t('studio.minimum_label')}</FieldLabel>
        </Label>
        <Input
          value={minLabel || ''}
          placeholder={t('studio.minimum_label')}
          className={toneClasses.fieldClassName}
          onChange={(event) =>
            form.setValue(
              `sections.${sectionIndex}.questions.${questionIndex}.settings.minLabel`,
              event.target.value,
              { shouldDirty: true }
            )
          }
        />
      </div>
      <div className="space-y-1.5">
        <Label>
          <FieldLabel icon={Star}>{t('studio.maximum_label')}</FieldLabel>
        </Label>
        <Input
          value={maxLabel || ''}
          placeholder={t('studio.maximum_label')}
          className={toneClasses.fieldClassName}
          onChange={(event) =>
            form.setValue(
              `sections.${sectionIndex}.questions.${questionIndex}.settings.maxLabel`,
              event.target.value,
              { shouldDirty: true }
            )
          }
        />
      </div>
      {!isRating ? (
        <>
          <div className="space-y-1.5">
            <Label>
              <FieldLabel icon={Flag}>{t('studio.scale_min')}</FieldLabel>
            </Label>
            <Input
              type="number"
              min={0}
              max={10}
              value={scaleMin ?? 1}
              className={toneClasses.fieldClassName}
              onChange={(event) =>
                form.setValue(
                  `sections.${sectionIndex}.questions.${questionIndex}.settings.scaleMin`,
                  Number(event.target.value),
                  { shouldDirty: true }
                )
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              <FieldLabel icon={Star}>{t('studio.scale_max')}</FieldLabel>
            </Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={scaleMax ?? 5}
              className={toneClasses.fieldClassName}
              onChange={(event) =>
                form.setValue(
                  `sections.${sectionIndex}.questions.${questionIndex}.settings.scaleMax`,
                  Number(event.target.value),
                  { shouldDirty: true }
                )
              }
            />
          </div>
        </>
      ) : (
        <div className="space-y-1.5 md:col-span-2">
          <Label>
            <FieldLabel icon={Star}>{t('studio.rating_max')}</FieldLabel>
          </Label>
          <Input
            type="number"
            min={2}
            max={10}
            value={ratingMax ?? 5}
            className={toneClasses.fieldClassName}
            onChange={(event) =>
              form.setValue(
                `sections.${sectionIndex}.questions.${questionIndex}.settings.ratingMax`,
                Number(event.target.value),
                { shouldDirty: true }
              )
            }
          />
        </div>
      )}

      <div className="space-y-2 md:col-span-2">
        <div className="flex items-center justify-between">
          <Label>
            <FieldLabel icon={ListChecks}>{t('studio.options')}</FieldLabel>
          </Label>
          <span className="text-muted-foreground text-xs">
            {t('studio.scale_labels_hint')}
          </span>
        </div>
        <div className="grid gap-2">
          {optionsArray.fields.map((field, optionIndex) => {
            const optionValue = watchedOptions?.[optionIndex]?.value || '';
            const optionLabel = watchedOptions?.[optionIndex]?.label || '';

            return (
              <div
                key={field.id}
                className="grid gap-2 rounded-2xl border border-border/50 bg-background/60 p-2 sm:grid-cols-[auto_minmax(0,1fr)]"
              >
                <div className="flex min-h-10 min-w-12 items-center justify-center rounded-xl border border-border/60 bg-background/80 px-3 font-semibold text-sm">
                  {optionValue}
                </div>
                <FormsRichTextEditor
                  value={optionLabel}
                  toneClasses={toneClasses}
                  placeholder={t('studio.label')}
                  onChange={(nextValue) =>
                    form.setValue(
                      `sections.${sectionIndex}.questions.${questionIndex}.options.${optionIndex}.label`,
                      nextValue,
                      {
                        shouldDirty: true,
                      }
                    )
                  }
                  compact
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
