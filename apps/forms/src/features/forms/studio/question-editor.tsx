'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Clock3 } from '@tuturuuu/icons';
import { Collapsible, CollapsibleContent } from '@tuturuuu/ui/collapsible';
import { useFieldArray, useWatch } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { deriveUniqueOptionValue } from '../answer-utils';
import { isAnswerableQuestionType } from '../block-utils';
import type { getFormToneClasses } from '../theme';
import {
  getBodyTypographyClassName,
  getStudioTitleTypographyClassName,
} from '../typography';
import { renderQuestionEditorChoiceOptions } from './question-editor-choice-options';
import { renderQuestionEditorFields } from './question-editor-fields';
import { renderQuestionEditorHeader } from './question-editor-header';
import { renderQuestionEditorScaleSettings } from './question-editor-scale-settings';
import { createClientId, type StudioForm } from './studio-utils';

const TITLE_PLACEHOLDER_MAP: Record<string, string> = {
  short_text: 'placeholder_title_text',
  long_text: 'placeholder_title_text',
  email: 'placeholder_title_text',
  phone: 'placeholder_title_text',
  number: 'placeholder_title_text',
  url: 'placeholder_title_text',
  single_choice: 'placeholder_title_choice',
  multiple_choice: 'placeholder_title_choice',
  dropdown: 'placeholder_title_choice',
  ranking: 'placeholder_title_choice',
  linear_scale: 'placeholder_title_scale',
  rating: 'placeholder_title_scale',
  nps: 'placeholder_title_scale',
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
  variant = 'inline',
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
  /**
   * `inline` is the accordion in the block list. `panel` drops the header and
   * drag handle for the three-pane properties column, where the outline
   * already owns selection and ordering.
   */
  variant?: 'inline' | 'panel';
}) {
  const t = useTranslations('forms');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
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
  const showsCharacterCount =
    questionType === 'short_text' || questionType === 'long_text';

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

  // Ranking authors the same list of options as the choice types; only the
  // respondent's interaction differs, so it reuses the options editor.
  const hasChoices = [
    'single_choice',
    'multiple_choice',
    'dropdown',
    'ranking',
  ].includes(questionType);
  const hasCardChoiceLayout = ['single_choice', 'multiple_choice'].includes(
    questionType
  );
  const hasScale = ['linear_scale', 'rating'].includes(questionType);
  // NPS deliberately does not use the scale editor: its bounds are fixed at
  // 0-10 by the metric's definition, and exposing them as editable would let an
  // author produce something labelled NPS that is not comparable to one.
  const isNps = questionType === 'nps';
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

  const blockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && blockRef.current) {
      setTimeout(() => {
        blockRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 150);
    }
  }, [open]);

  const setCombinedNodeRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    blockRef.current = node;
  };

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

  const editorBody = (
    <div className="space-y-3 px-4 py-4">
      {renderQuestionEditorFields({
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
      })}

      {/* Choice-type options */}
      {hasChoices
        ? renderQuestionEditorChoiceOptions({
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
          })
        : null}

      {/* Scale settings */}
      {hasScale
        ? renderQuestionEditorScaleSettings({
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
          })
        : null}

      {/* NPS anchor labels */}
      {isNps ? (
        <div className="grid gap-3 rounded-[1.35rem] border border-border/60 bg-muted/20 p-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('studio.minimum_label')}</Label>
            <Input
              value={minLabel ?? ''}
              placeholder={t('studio.nps_default_min_label')}
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
            <Label>{t('studio.maximum_label')}</Label>
            <Input
              value={maxLabel ?? ''}
              placeholder={t('studio.nps_default_max_label')}
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
          <p className="text-muted-foreground text-xs md:col-span-2">
            {t('studio.hint_nps')}
          </p>
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
  );

  // The properties pane renders the same body without the accordion chrome:
  // in a three-pane layout the block is already selected in the outline, so a
  // header to expand and a drag handle to reorder would both be duplicates of
  // controls the outline already owns.
  if (variant === 'panel') {
    return editorBody;
  }

  return (
    <Collapsible open={open && !isDragging} onOpenChange={onOpenChange}>
      <div
        ref={setCombinedNodeRef}
        style={style}
        className={cn(
          'rounded-[1.75rem] border',
          !isDragging && 'transition-all duration-300',
          open
            ? 'border-border/80 bg-background/95 shadow-foreground/5 shadow-md'
            : 'border-border/50 bg-muted/30 shadow-sm hover:bg-muted/50',
          isDragging && 'z-10 opacity-70 shadow-lg'
        )}
      >
        {renderQuestionEditorHeader({
          t,
          setActivatorNodeRef,
          attributes,
          listeners,
          toneClasses,
          questionIndex,
          isSectionBreak,
          questionType,
          studioTitleClassName,
          questionTitle,
          required,
          open,
          actionsOpen,
          setActionsOpen,
          onMoveUp,
          onMoveDown,
          onDuplicate,
          onRemove,
          deleteDialogOpen,
          setDeleteDialogOpen,
        })}
        <CollapsibleContent className="overflow-hidden border-border/40 border-t data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          {editorBody}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
