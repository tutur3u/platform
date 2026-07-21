'use client';

import {
  CircleCheckBig,
  ClipboardList,
  FileText,
  MessageSquare,
  Shield,
} from '@tuturuuu/icons';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';

import { isAnswerableQuestionType } from '../block-utils';
import { FieldLabel, QuestionTypeIcon } from '../form-icons';
import { FormsRichTextEditor } from '../forms-rich-text-editor';
import {
  FORM_QUESTION_DESCRIPTION_MAX_LENGTH,
  FORM_QUESTION_TITLE_MAX_LENGTH,
  FORM_QUESTION_TYPE_VALUES,
  FORM_VALIDATION_MODE_VALUES,
  type FormQuestionInput,
} from '../schema';
import type { getFormToneClasses } from '../theme';
import { parseYouTubeUrl } from '../youtube';
import { createQuestionInput } from './block-catalog';
import { FormMediaField } from './form-media-field';
import type { FormsTranslator } from './studio-translator';
import type { StudioForm } from './studio-utils';

export function renderQuestionEditorFields({
  t,
  wsId,
  form,
  sectionIndex,
  questionIndex,
  toneClasses,
  typePath,
  questionType,
  questionTitle,
  questionDescription,
  questionImage,
  settings,
  required,
  placeholder,
  titlePlaceholder,
  showsCharacterCount,
  showsDescriptionEditor,
  isAnswerable,
  isDividerBlock,
  isImageBlock,
  isYoutubeBlock,
  validationMode,
  validationMin,
  validationMax,
  validationPattern,
  validationMessage,
}: {
  t: FormsTranslator;
  wsId: string;
  form: StudioForm;
  sectionIndex: number;
  questionIndex: number;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  typePath: `sections.${number}.questions.${number}.type`;
  questionType: FormQuestionInput['type'];
  questionTitle: string | undefined;
  questionDescription: string | undefined;
  questionImage: FormQuestionInput['image'] | undefined;
  settings: Partial<FormQuestionInput['settings']>;
  required: boolean | undefined;
  placeholder: string | null | undefined;
  titlePlaceholder: string;
  showsCharacterCount: boolean;
  showsDescriptionEditor: boolean;
  isAnswerable: boolean;
  isDividerBlock: boolean;
  isImageBlock: boolean;
  isYoutubeBlock: boolean;
  validationMode: FormQuestionInput['settings']['validationMode'];
  validationMin: number | null | undefined;
  validationMax: number | null | undefined;
  validationPattern: string | null | undefined;
  validationMessage: string | null | undefined;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {!isDividerBlock ? (
        <div className="space-y-1.5 md:col-span-2">
          <Label>
            <FieldLabel icon={FileText}>
              {t('studio.question_title')}
            </FieldLabel>
          </Label>
          <FormsRichTextEditor
            value={questionTitle || ''}
            onChange={(nextValue) =>
              form.setValue(
                `sections.${sectionIndex}.questions.${questionIndex}.title`,
                nextValue,
                { shouldDirty: true }
              )
            }
            placeholder={titlePlaceholder}
            toneClasses={toneClasses}
            compact
          />
          {showsCharacterCount && (
            <div className="flex justify-end pr-1 text-muted-foreground text-xs">
              {questionTitle?.length || 0} / {FORM_QUESTION_TITLE_MAX_LENGTH}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-[1.35rem] border border-border/60 bg-muted/20 px-4 py-5 md:col-span-2">
          <Separator className="bg-border/60" />
        </div>
      )}
      <div className="space-y-1.5">
        <Label>
          <FieldLabel icon={ClipboardList}>{t('studio.type')}</FieldLabel>
        </Label>
        <Select
          value={questionType}
          onValueChange={(value) => {
            const nextType = value as FormQuestionInput['type'];
            const nextTemplate = createQuestionInput(nextType, t);
            const currentQuestion = form.getValues(
              `sections.${sectionIndex}.questions.${questionIndex}`
            );

            form.setValue(typePath, nextType, {
              shouldDirty: true,
            });
            form.setValue(
              `sections.${sectionIndex}.questions.${questionIndex}.settings`,
              nextTemplate.settings,
              { shouldDirty: true }
            );
            form.setValue(
              `sections.${sectionIndex}.questions.${questionIndex}.options`,
              nextTemplate.options,
              { shouldDirty: true }
            );
            form.setValue(
              `sections.${sectionIndex}.questions.${questionIndex}.image`,
              currentQuestion?.image ?? nextTemplate.image,
              { shouldDirty: true }
            );
            if (!currentQuestion?.title?.trim()) {
              form.setValue(
                `sections.${sectionIndex}.questions.${questionIndex}.title`,
                nextTemplate.title,
                { shouldDirty: true }
              );
            }
            if (!currentQuestion?.description?.trim()) {
              form.setValue(
                `sections.${sectionIndex}.questions.${questionIndex}.description`,
                nextTemplate.description,
                { shouldDirty: true }
              );
            }
            if (!isAnswerableQuestionType(nextType)) {
              form.setValue(
                `sections.${sectionIndex}.questions.${questionIndex}.required`,
                false,
                { shouldDirty: true }
              );
            }
          }}
        >
          <SelectTrigger className={toneClasses.fieldClassName}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FORM_QUESTION_TYPE_VALUES.map((type) => (
              <SelectItem key={type} value={type}>
                <div className="flex items-center gap-2">
                  <QuestionTypeIcon type={type} className="h-4 w-4" />
                  <span>{t(`question_type.${type}`)}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showsDescriptionEditor ? (
        <>
          {isAnswerable ? (
            <div className="space-y-1.5">
              <Label>
                <FieldLabel icon={CircleCheckBig}>
                  {t('studio.required')}
                </FieldLabel>
              </Label>
              <label
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
                  toneClasses.optionCardClassName
                )}
              >
                <Checkbox
                  className={toneClasses.checkboxClassName}
                  checked={!!required}
                  onCheckedChange={(checked) =>
                    form.setValue(
                      `sections.${sectionIndex}.questions.${questionIndex}.required`,
                      checked === true,
                      { shouldDirty: true }
                    )
                  }
                />
                <span className="text-sm">
                  {t('studio.require_before_continue')}
                </span>
              </label>
            </div>
          ) : null}
          <div className="space-y-1.5 md:col-span-2">
            <Label>
              <FieldLabel icon={MessageSquare}>
                {t('studio.description')}
              </FieldLabel>
            </Label>
            <FormsRichTextEditor
              value={questionDescription || ''}
              onChange={(nextValue) =>
                form.setValue(
                  `sections.${sectionIndex}.questions.${questionIndex}.description`,
                  nextValue,
                  { shouldDirty: true }
                )
              }
              placeholder={t('studio.description_placeholder')}
              toneClasses={toneClasses}
            />
            <div className="flex justify-end pr-1 text-muted-foreground text-xs">
              {questionDescription?.length || 0} /{' '}
              {FORM_QUESTION_DESCRIPTION_MAX_LENGTH}
            </div>
          </div>
        </>
      ) : null}
      {isAnswerable ? (
        <div className="space-y-1.5 md:col-span-2">
          <Label>
            <FieldLabel icon={ClipboardList}>
              {t('studio.placeholder_helper')}
            </FieldLabel>
          </Label>
          <Input
            value={placeholder || ''}
            placeholder={t('studio.placeholder_hint')}
            className={toneClasses.fieldClassName}
            onChange={(event) =>
              form.setValue(
                `sections.${sectionIndex}.questions.${questionIndex}.settings.placeholder`,
                event.target.value,
                { shouldDirty: true }
              )
            }
          />
        </div>
      ) : null}
      {questionType === 'short_text' || questionType === 'long_text' ? (
        <div className="space-y-3 rounded-[1.35rem] border border-border/60 bg-muted/20 p-3 md:col-span-2">
          <Label>
            <FieldLabel icon={Shield}>{t('studio.validation_mode')}</FieldLabel>
          </Label>
          <Select
            value={validationMode ?? 'none'}
            onValueChange={(value) =>
              form.setValue(
                `sections.${sectionIndex}.questions.${questionIndex}.settings.validationMode`,
                value as (typeof FORM_VALIDATION_MODE_VALUES)[number],
                { shouldDirty: true }
              )
            }
          >
            <SelectTrigger className={toneClasses.fieldClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORM_VALIDATION_MODE_VALUES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(
                    `studio.validation_mode_${mode}` as Parameters<typeof t>[0]
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {validationMode === 'integer' ||
          validationMode === 'numeric' ||
          validationMode === 'real' ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('studio.validation_min')}</Label>
                <Input
                  type="number"
                  value={validationMin ?? ''}
                  placeholder="-"
                  className={toneClasses.fieldClassName}
                  onChange={(event) => {
                    const v = event.target.value;
                    form.setValue(
                      `sections.${sectionIndex}.questions.${questionIndex}.settings.validationMin`,
                      v === '' ? undefined : Number(v),
                      { shouldDirty: true }
                    );
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('studio.validation_max')}</Label>
                <Input
                  type="number"
                  value={validationMax ?? ''}
                  placeholder="-"
                  className={toneClasses.fieldClassName}
                  onChange={(event) => {
                    const v = event.target.value;
                    form.setValue(
                      `sections.${sectionIndex}.questions.${questionIndex}.settings.validationMax`,
                      v === '' ? undefined : Number(v),
                      { shouldDirty: true }
                    );
                  }}
                />
              </div>
            </div>
          ) : null}
          {validationMode === 'regex' ? (
            <div className="space-y-1.5">
              <Label>{t('studio.validation_pattern')}</Label>
              <Input
                value={validationPattern ?? ''}
                placeholder="e.g. ^[A-Za-z]+$"
                className={toneClasses.fieldClassName}
                onChange={(event) =>
                  form.setValue(
                    `sections.${sectionIndex}.questions.${questionIndex}.settings.validationPattern`,
                    event.target.value,
                    { shouldDirty: true }
                  )
                }
              />
            </div>
          ) : null}
          {validationMode === 'integer' ||
          validationMode === 'numeric' ||
          validationMode === 'real' ||
          validationMode === 'regex' ||
          validationMode === 'email' ||
          validationMode === 'url' ? (
            <div className="space-y-1.5">
              <Label>{t('studio.validation_message')}</Label>
              <Input
                value={validationMessage ?? ''}
                placeholder={t('studio.validation_message_placeholder')}
                className={toneClasses.fieldClassName}
                onChange={(event) =>
                  form.setValue(
                    `sections.${sectionIndex}.questions.${questionIndex}.settings.validationMessage`,
                    event.target.value,
                    { shouldDirty: true }
                  )
                }
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {isAnswerable || isImageBlock ? (
        <div className="md:col-span-2">
          <FormMediaField
            wsId={wsId}
            scope={isImageBlock ? 'cover' : 'section'}
            value={
              questionImage ?? {
                storagePath: '',
                url: '',
                alt: '',
              }
            }
            onChange={(value) =>
              form.setValue(
                `sections.${sectionIndex}.questions.${questionIndex}.image`,
                value,
                { shouldDirty: true }
              )
            }
            toneClasses={toneClasses}
            label={t('studio.question_image')}
            hint={t('studio.question_image_hint')}
          />
        </div>
      ) : null}
      {isYoutubeBlock ? (
        <>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('studio.youtube_url')}</Label>
            <Input
              value={settings.youtubeUrl || ''}
              placeholder="https://www.youtube.com/watch?v=..."
              className={toneClasses.fieldClassName}
              onChange={(event) => {
                const nextUrl = event.target.value;
                const parsed = parseYouTubeUrl(nextUrl);

                form.setValue(
                  `sections.${sectionIndex}.questions.${questionIndex}.settings.youtubeUrl`,
                  nextUrl,
                  { shouldDirty: true }
                );
                form.setValue(
                  `sections.${sectionIndex}.questions.${questionIndex}.settings.youtubeVideoId`,
                  parsed?.videoId ?? '',
                  { shouldDirty: true }
                );
                form.setValue(
                  `sections.${sectionIndex}.questions.${questionIndex}.settings.youtubeStartSeconds`,
                  parsed?.startSeconds ?? 0,
                  { shouldDirty: true }
                );
              }}
            />
          </div>
          {!settings.youtubeVideoId && settings.youtubeUrl ? (
            <div className="rounded-2xl border border-dynamic-orange/20 bg-dynamic-orange/8 px-4 py-3 text-dynamic-orange text-sm md:col-span-2">
              {t('studio.invalid_youtube_link')}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
