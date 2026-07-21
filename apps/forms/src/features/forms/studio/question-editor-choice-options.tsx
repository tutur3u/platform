'use client';

import { ListChecks, Plus, Trash } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';

import { deriveUniqueOptionValue } from '../answer-utils';
import { FieldLabel } from '../form-icons';
import { FormsMarkdown } from '../forms-markdown';
import { FormsRichTextEditor } from '../forms-rich-text-editor';
import type { FormQuestionInput } from '../schema';
import type { getFormToneClasses } from '../theme';
import { FormMediaField } from './form-media-field';
import type { FormsTranslator } from './studio-translator';
import type { StudioForm } from './studio-utils';

export function renderQuestionEditorChoiceOptions({
  t,
  wsId,
  form,
  sectionIndex,
  questionIndex,
  toneClasses,
  bodyClassName,
  hasChoices,
  hasCardChoiceLayout,
  optionLayout,
  optionsArray,
  watchedOptions,
  addOption,
}: {
  t: FormsTranslator;
  wsId: string;
  form: StudioForm;
  sectionIndex: number;
  questionIndex: number;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  bodyClassName: string;
  hasChoices: boolean;
  hasCardChoiceLayout: boolean;
  optionLayout: FormQuestionInput['settings']['optionLayout'];
  optionsArray: {
    fields: Array<{ id: string }>;
    remove: (index: number) => void;
  };
  watchedOptions: FormQuestionInput['options'] | undefined;
  addOption: () => void;
}) {
  return (
    <div className="space-y-2 rounded-[1.35rem] border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <Label>
          <FieldLabel icon={ListChecks}>{t('studio.options')}</FieldLabel>
        </Label>
      </div>
      {hasCardChoiceLayout ? (
        <div className="space-y-1.5">
          <Label>{t('studio.option_layout')}</Label>
          <Select
            value={optionLayout || 'list'}
            onValueChange={(value) =>
              form.setValue(
                `sections.${sectionIndex}.questions.${questionIndex}.settings.optionLayout`,
                value as NonNullable<
                  FormQuestionInput['settings']['optionLayout']
                >,
                { shouldDirty: true }
              )
            }
          >
            <SelectTrigger className={toneClasses.fieldClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="list">
                {t('studio.option_layout_list')}
              </SelectItem>
              <SelectItem value="grid">
                {t('studio.option_layout_grid')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {optionsArray.fields.map((field, optionIndex) => (
        <div
          key={field.id}
          className="space-y-3 rounded-2xl border border-border/50 bg-background/60 p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label>{t('studio.label')}</Label>
              <FormsRichTextEditor
                value={watchedOptions?.[optionIndex]?.label || ''}
                toneClasses={toneClasses}
                placeholder={t('studio.label')}
                onChange={(nextLabel) => {
                  const labelPath =
                    `sections.${sectionIndex}.questions.${questionIndex}.options.${optionIndex}.label` as const;
                  const valuePath =
                    `sections.${sectionIndex}.questions.${questionIndex}.options.${optionIndex}.value` as const;
                  const currentValue = form.getValues(valuePath) || '';
                  const currentLabel = form.getValues(labelPath) || '';
                  const siblingValues =
                    (
                      form.getValues(
                        `sections.${sectionIndex}.questions.${questionIndex}.options`
                      ) ?? []
                    )
                      .map((option) => option.value)
                      .filter((_, index) => index !== optionIndex) ?? [];
                  const nextValue = deriveUniqueOptionValue(
                    nextLabel,
                    siblingValues,
                    currentValue
                  );

                  form.setValue(labelPath, nextLabel, {
                    shouldDirty: true,
                  });

                  if (
                    !currentValue ||
                    currentValue ===
                      deriveUniqueOptionValue(
                        currentLabel,
                        siblingValues,
                        currentValue
                      )
                  ) {
                    form.setValue(valuePath, nextValue, {
                      shouldDirty: true,
                    });
                  }
                }}
                compact
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-7 rounded-xl"
              onClick={() => optionsArray.remove(optionIndex)}
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
          <div className="rounded-2xl border border-border/50 bg-background/55 p-3">
            <FormsMarkdown
              content={
                watchedOptions?.[optionIndex]?.label || t('studio.label')
              }
              className={cn(bodyClassName, '[&_p]:leading-6')}
            />
          </div>
          {hasChoices ? (
            <FormMediaField
              wsId={wsId}
              scope="option"
              value={
                watchedOptions?.[optionIndex]?.image ?? {
                  storagePath: '',
                  url: '',
                  alt: '',
                }
              }
              onChange={(value) =>
                form.setValue(
                  `sections.${sectionIndex}.questions.${questionIndex}.options.${optionIndex}.image`,
                  value,
                  { shouldDirty: true }
                )
              }
              toneClasses={toneClasses}
              label={t('studio.option_image')}
              hint={t('studio.option_image_hint')}
            />
          ) : null}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className={cn(
          'w-full rounded-xl',
          toneClasses.secondaryButtonClassName
        )}
        onClick={addOption}
      >
        <Plus className="mr-2 h-4 w-4" />
        {t('studio.add_option')}
      </Button>
    </div>
  );
}
