'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  CircleCheckBig,
  ClipboardList,
  Clock3,
  Copy,
  FileText,
  Flag,
  GripVertical,
  ListChecks,
  MessageSquare,
  Plus,
  Shield,
  Star,
  Trash,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { useFieldArray, useWatch } from '@tuturuuu/ui/hooks/use-form';
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
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { deriveUniqueOptionValue } from '../answer-utils';
import { isAnswerableQuestionType } from '../block-utils';
import { FieldLabel, QuestionTypeIcon } from '../form-icons';
import { FormsMarkdown } from '../forms-markdown';
import { FormsRichTextEditor } from '../forms-rich-text-editor';
import {
  FORM_QUESTION_TYPE_VALUES,
  FORM_VALIDATION_MODE_VALUES,
  type FormQuestionInput,
} from '../schema';
import type { getFormToneClasses } from '../theme';
import {
  getBodyTypographyClassName,
  getStudioTitleTypographyClassName,
} from '../typography';
import { parseYouTubeUrl } from '../youtube';
import { createQuestionInput } from './block-catalog';
import { DestructiveActionDialog } from './destructive-action-dialog';
import { FormMediaField } from './form-media-field';
import { createClientId, type StudioForm } from './studio-utils';

const TITLE_PLACEHOLDER_MAP: Record<string, string> = {
  short_text: 'placeholder_title_text',
  long_text: 'placeholder_title_text',
  single_choice: 'placeholder_title_choice',
  multiple_choice: 'placeholder_title_choice',
  dropdown: 'placeholder_title_choice',
  linear_scale: 'placeholder_title_scale',
  rating: 'placeholder_title_scale',
  date: 'placeholder_title_date',
  time: 'placeholder_title_time',
  section_break: 'placeholder_title_section_break',
  rich_text: 'placeholder_title_rich_text',
  image: 'placeholder_title_image',
  youtube: 'placeholder_title_youtube',
  divider: 'placeholder_title_divider',
};

export function QuestionEditor({
  wsId,
  questionId,
  sectionIndex,
  questionIndex,
  form,
  open,
  onOpenChange,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
  toneClasses,
}: {
  wsId: string;
  questionId: string;
  sectionIndex: number;
  questionIndex: number;
  form: StudioForm;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  toneClasses: ReturnType<typeof getFormToneClasses>;
}) {
  const t = useTranslations('forms');
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: questionId });
  const typePath =
    `sections.${sectionIndex}.questions.${questionIndex}.type` as const;
  const questionType = useWatch({
    control: form.control,
    name: typePath,
  });

  const optionsArray = useFieldArray({
    control: form.control,
    name: `sections.${sectionIndex}.questions.${questionIndex}.options`,
  });

  const questionTitle = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.questions.${questionIndex}.title`,
  });
  const questionDescription = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.questions.${questionIndex}.description`,
  });
  const settings =
    useWatch({
      control: form.control,
      name: `sections.${sectionIndex}.questions.${questionIndex}.settings`,
    }) ?? {};
  const questionImage = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.questions.${questionIndex}.image`,
  });
  const required = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.questions.${questionIndex}.required`,
  });
  const placeholder = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.questions.${questionIndex}.settings.placeholder`,
  });
  const scaleMin = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.questions.${questionIndex}.settings.scaleMin`,
  });
  const scaleMax = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.questions.${questionIndex}.settings.scaleMax`,
  });
  const ratingMax = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.questions.${questionIndex}.settings.ratingMax`,
  });
  const minLabel = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.questions.${questionIndex}.settings.minLabel`,
  });
  const maxLabel = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.questions.${questionIndex}.settings.maxLabel`,
  });
  const watchedOptions = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.questions.${questionIndex}.options`,
  });
  const optionLayout = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.questions.${questionIndex}.settings.optionLayout`,
  });
  const validationMode = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.questions.${questionIndex}.settings.validationMode`,
  });
  const validationMin = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.questions.${questionIndex}.settings.validationMin`,
  });
  const validationMax = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.questions.${questionIndex}.settings.validationMax`,
  });
  const validationPattern = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.questions.${questionIndex}.settings.validationPattern`,
  });
  const validationMessage = useWatch({
    control: form.control,
    name: `sections.${sectionIndex}.questions.${questionIndex}.settings.validationMessage`,
  });
  const typography = useWatch({
    control: form.control,
    name: 'theme.typography',
  });
  const studioTitleClassName = getStudioTitleTypographyClassName(
    typography?.headingSize ?? 'md'
  );
  const bodyClassName = getBodyTypographyClassName(
    typography?.bodySize ?? 'md'
  );

  const addOption = () => {
    const nextLabel = t('studio.new_option');
    const existingValues =
      form
        .getValues(
          `sections.${sectionIndex}.questions.${questionIndex}.options`
        )
        ?.map((option) => option.value) ?? [];

    optionsArray.append({
      id: createClientId(),
      label: nextLabel,
      value: deriveUniqueOptionValue(nextLabel, existingValues),
      image: {
        storagePath: '',
        url: '',
        alt: '',
      },
    });
  };

  const titlePlaceholderKey =
    TITLE_PLACEHOLDER_MAP[questionType] ?? 'placeholder_title_default';
  const titlePlaceholder = t(
    `studio.${titlePlaceholderKey}` as Parameters<typeof t>[0]
  );

  const hasChoices = ['single_choice', 'multiple_choice', 'dropdown'].includes(
    questionType
  );
  const hasCardChoiceLayout = ['single_choice', 'multiple_choice'].includes(
    questionType
  );
  const hasScale = ['linear_scale', 'rating'].includes(questionType);
  const isRating = questionType === 'rating';
  const isDateOrTime = questionType === 'date' || questionType === 'time';
  const isSectionBreak = questionType === 'section_break';
  const isRichText = questionType === 'rich_text';
  const isImageBlock = questionType === 'image';
  const isYoutubeBlock = questionType === 'youtube';
  const isDividerBlock = questionType === 'divider';
  const isAnswerable = isAnswerableQuestionType(questionType);
  const showsDescriptionEditor =
    isAnswerable || isRichText || isImageBlock || isYoutubeBlock;

  useEffect(() => {
    if (!hasScale) {
      return;
    }

    const minimum = isRating ? 1 : Math.max(0, scaleMin ?? 1);
    const maximum = isRating
      ? Math.max(2, ratingMax ?? 5)
      : Math.max(minimum, scaleMax ?? 5);
    const optionsPath =
      `sections.${sectionIndex}.questions.${questionIndex}.options` as const;
    const existingOptions = form.getValues(optionsPath) ?? [];
    const nextOptions = Array.from(
      { length: maximum - minimum + 1 },
      (_, index) => {
        const score = String(minimum + index);
        const existingOption = existingOptions.find(
          (option) => option.value === score
        );

        return {
          id: existingOption?.id ?? createClientId(),
          value: score,
          label: existingOption?.label ?? score,
          image: existingOption?.image ?? {
            storagePath: '',
            url: '',
            alt: '',
          },
        };
      }
    );

    const currentSnapshot = JSON.stringify(
      existingOptions.map((option) => ({
        value: option.value,
        label: option.label,
      }))
    );
    const nextSnapshot = JSON.stringify(
      nextOptions.map((option) => ({
        value: option.value,
        label: option.label,
      }))
    );

    if (currentSnapshot !== nextSnapshot) {
      optionsArray.replace(nextOptions);
    }
  }, [
    form,
    hasScale,
    isRating,
    optionsArray,
    questionIndex,
    ratingMax,
    scaleMax,
    scaleMin,
    sectionIndex,
  ]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          'rounded-3xl border border-border/70 bg-background/80 shadow-sm transition-shadow',
          isDragging && 'z-10 opacity-70 shadow-lg'
        )}
      >
        <div className="flex items-start gap-2 px-4 py-3">
          <Button
            ref={setActivatorNodeRef}
            type="button"
            size="icon"
            variant="ghost"
            className="mt-0.5 shrink-0 cursor-grab rounded-xl text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label={t('studio.reorder_questions')}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </Button>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-auto flex-1 justify-start px-0 hover:bg-transparent"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border font-semibold text-xs',
                    toneClasses.selectedOptionClassName
                  )}
                >
                  {questionIndex + 1}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  {isSectionBreak ? (
                    <div className="flex min-h-9 items-center">
                      <Separator className="bg-border/60" />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80 text-muted-foreground">
                          <QuestionTypeIcon
                            type={questionType}
                            className="h-3.5 w-3.5"
                          />
                        </span>
                        <div
                          className={cn(
                            'min-w-0 flex-1 truncate text-left',
                            studioTitleClassName
                          )}
                        >
                          <FormsMarkdown
                            content={
                              questionTitle ||
                              t('studio.question_number', {
                                count: questionIndex + 1,
                              })
                            }
                            variant="inline"
                            className="truncate"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="rounded-full px-2 py-0.5 text-[11px]"
                        >
                          {t(`question_type.${questionType}`)}
                        </Badge>
                        {required ? (
                          <Badge
                            variant="outline"
                            className="rounded-full px-2 py-0.5 text-[11px]"
                          >
                            {t('runtime.required')}
                          </Badge>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 transition-transform',
                  open && 'rotate-180'
                )}
              />
            </Button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onMoveUp}
              className="rounded-xl"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onMoveDown}
              className="rounded-xl"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onDuplicate}
              className="rounded-xl"
              aria-label={t('studio.duplicate_question')}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <DestructiveActionDialog
              actionLabel={t('studio.delete_question')}
              cancelLabel={t('studio.keep_question')}
              description={t('studio.delete_question_confirmation')}
              onConfirm={onRemove}
              title={t('studio.delete_question_title')}
              trigger={
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="rounded-xl text-muted-foreground hover:text-destructive"
                >
                  <Trash className="h-4 w-4" />
                </Button>
              }
            />
          </div>
        </div>

        <CollapsibleContent className="overflow-hidden border-border/60 border-t data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div className="space-y-3 px-4 py-4">
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
                </div>
              ) : (
                <div className="rounded-[1.35rem] border border-border/60 bg-muted/20 px-4 py-5 md:col-span-2">
                  <Separator className="bg-border/60" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>
                  <FieldLabel icon={ClipboardList}>
                    {t('studio.type')}
                  </FieldLabel>
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
                    <FieldLabel icon={Shield}>
                      {t('studio.validation_mode')}
                    </FieldLabel>
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
                            `studio.validation_mode_${mode}` as Parameters<
                              typeof t
                            >[0]
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
                  validationMode === 'email' ? (
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

            {/* Choice-type options */}
            {hasChoices ? (
              <div className="space-y-2 rounded-[1.35rem] border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <Label>
                    <FieldLabel icon={ListChecks}>
                      {t('studio.options')}
                    </FieldLabel>
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
                            const currentValue =
                              form.getValues(valuePath) || '';
                            const currentLabel =
                              form.getValues(labelPath) || '';
                            const siblingValues =
                              (
                                form.getValues(
                                  `sections.${sectionIndex}.questions.${questionIndex}.options`
                                ) ?? []
                              )
                                .map((option) => option.value)
                                .filter((_, index) => index !== optionIndex) ??
                              [];
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
                          watchedOptions?.[optionIndex]?.label ||
                          t('studio.label')
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
            ) : null}

            {/* Scale settings */}
            {hasScale ? (
              <div className="grid gap-3 rounded-[1.35rem] border border-border/60 bg-muted/20 p-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>
                    <FieldLabel icon={Flag}>
                      {t('studio.minimum_label')}
                    </FieldLabel>
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
                    <FieldLabel icon={Star}>
                      {t('studio.maximum_label')}
                    </FieldLabel>
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
                        <FieldLabel icon={Flag}>
                          {t('studio.scale_min')}
                        </FieldLabel>
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
                        <FieldLabel icon={Star}>
                          {t('studio.scale_max')}
                        </FieldLabel>
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
                      <FieldLabel icon={Star}>
                        {t('studio.rating_max')}
                      </FieldLabel>
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
                      <FieldLabel icon={ListChecks}>
                        {t('studio.options')}
                      </FieldLabel>
                    </Label>
                    <span className="text-muted-foreground text-xs">
                      {t('studio.scale_labels_hint')}
                    </span>
                  </div>
                  <div className="grid gap-2">
                    {optionsArray.fields.map((field, optionIndex) => {
                      const optionValue =
                        watchedOptions?.[optionIndex]?.value || '';
                      const optionLabel =
                        watchedOptions?.[optionIndex]?.label || '';

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
            ) : null}

            {/* Date / Time hint */}
            {isDateOrTime ? (
              <div className="flex items-center gap-2 rounded-[1.35rem] border border-border/60 bg-muted/20 px-4 py-3 text-muted-foreground text-sm">
                {questionType === 'date' ? (
                  <Calendar className="h-4 w-4 shrink-0" />
                ) : (
                  <Clock3 className="h-4 w-4 shrink-0" />
                )}
                {questionType === 'date'
                  ? t('studio.hint_date')
                  : t('studio.hint_time')}
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
