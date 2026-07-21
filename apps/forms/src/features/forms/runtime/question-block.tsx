'use client';

import { ZoomIn } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { normalizeMarkdownToText } from '../content';
import { FormsMarkdown } from '../forms-markdown';
import type { getFormToneClasses } from '../theme';
import type {
  FormAnswerValue,
  FormDefinition,
  FormDefinitionQuestion,
} from '../types';
import {
  getBodyTypographyClassName,
  getHeadingTypographyClassName,
} from '../typography';
import { getValidationConstraintHint } from '../validation';
import {
  renderDropdownField,
  renderMultipleChoiceField,
  renderSingleChoiceField,
} from './choice-fields';
import { TIME_OPTIONS } from './constants';
import { renderScaleField } from './scale-field';
import { renderStaticQuestionBlock } from './static-question-blocks';
import { formatDateAnswer, parseDateAnswer } from './utils';

export function QuestionBlock({
  question,
  value,
  onChange,
  onImagePreview,
  disabled = false,
  validationError,
  toneClasses,
  typography,
}: {
  question: FormDefinitionQuestion;
  value: FormAnswerValue | undefined;
  onChange: (value: FormAnswerValue) => void;
  onImagePreview: (image: { src: string; alt: string }) => void;
  disabled?: boolean;
  validationError?: string;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  typography: FormDefinition['theme']['typography'];
}) {
  const t = useTranslations('forms');
  const settings = question.settings ?? {};
  const headingClassName = getHeadingTypographyClassName(
    typography.headingSize
  );
  const bodyClassName = getBodyTypographyClassName(typography.bodySize);

  const staticBlock = renderStaticQuestionBlock({
    question,
    settings,
    t,
    headingClassName,
    bodyClassName,
    onImagePreview,
  });

  if (staticBlock) {
    return staticBlock;
  }

  const scaleMin = settings.scaleMin ?? 1;
  const scaleMax =
    question.type === 'rating'
      ? (settings.ratingMax ?? 5)
      : (settings.scaleMax ?? 5);
  const scaleOptions =
    question.type === 'linear_scale' || question.type === 'rating'
      ? question.options.filter((option) => {
          const numericValue = Number(option.value);
          return !Number.isNaN(numericValue);
        })
      : [];
  const displayScaleOptions =
    scaleOptions.length > 0
      ? scaleOptions
      : Array.from({ length: scaleMax - scaleMin + 1 }, (_, index) => {
          const score = scaleMin + index;
          return {
            id: `score-${score}`,
            value: String(score),
            label: String(score),
          };
        });
  const selectedScaleOption =
    typeof value === 'string' && value
      ? (displayScaleOptions.find((option) => option.value === value) ?? null)
      : null;
  const selectedScaleLabel =
    selectedScaleOption?.label || (typeof value === 'string' && value) || null;
  const selectedScaleNumber =
    typeof value === 'string' && value ? Number(value) : NaN;
  const scaleMinLabel =
    settings.minLabel || displayScaleOptions[0]?.label || String(scaleMin);
  const scaleMaxLabel =
    settings.maxLabel ||
    displayScaleOptions[displayScaleOptions.length - 1]?.label ||
    String(scaleMax);
  const hasCustomScaleLabels =
    scaleMinLabel.trim() !== String(scaleMin) ||
    scaleMaxLabel.trim() !== String(scaleMax);
  const questionTypeLabel = t(`question_type.${question.type}`);
  const optionLayout = settings.optionLayout === 'grid' ? 'grid' : 'list';
  const choiceLayoutClassName =
    optionLayout === 'grid' ? 'grid gap-3 sm:grid-cols-2' : 'space-y-2';
  const interactionStateClassName = disabled
    ? 'cursor-default opacity-75'
    : 'cursor-pointer transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]';
  const selectedDropdownOption =
    question.type === 'dropdown' && typeof value === 'string'
      ? (question.options.find((option) => option.value === value) ?? null)
      : null;

  return (
    <div
      id={`question-${question.id}`}
      className={cn(
        'group space-y-4 transition-all duration-300',
        validationError
          ? 'animate-shake rounded-4xl bg-dynamic-red/5 p-6 shadow-dynamic-red/5 shadow-sm ring-1 ring-dynamic-red/20'
          : disabled
            ? 'rounded-4xl p-6'
            : 'rounded-4xl p-6 transition-colors duration-500 hover:bg-foreground/2'
      )}
    >
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-[11px]',
              validationError
                ? 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red'
                : ''
            )}
          >
            <span>{questionTypeLabel}</span>
          </Badge>
          {question.required ? (
            <Badge
              variant="secondary"
              className={cn(
                'rounded-full px-2.5 py-1 font-medium text-[11px]',
                validationError
                  ? 'bg-dynamic-red text-white'
                  : 'bg-foreground/10'
              )}
            >
              {t('runtime.required')}
            </Badge>
          ) : null}
        </div>
        <div
          className={cn(
            'font-semibold leading-snug transition-colors',
            question.description ? 'pb-2' : 'pb-4',
            validationError ? 'text-dynamic-red' : '',
            headingClassName
          )}
        >
          <FormsMarkdown content={question.title} className="[&_p]:m-0" />
        </div>
        {question.image?.url ? (
          <div
            className={cn(
              'relative mt-3 aspect-video overflow-hidden rounded-[1.25rem] border bg-background/70 shadow-xs transition-all',
              validationError
                ? 'border-dynamic-red/40'
                : disabled
                  ? 'border-border/50'
                  : 'border-border/60 hover:border-border/80'
            )}
          >
            <Image
              src={question.image.url}
              alt={
                question.image.alt ||
                normalizeMarkdownToText(question.title) ||
                t('studio.question_image')
              }
              fill
              unoptimized
              className={cn(
                'object-cover',
                disabled
                  ? ''
                  : 'transition-transform duration-500 hover:scale-105'
              )}
            />
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute top-3 right-3 h-9 w-9 rounded-full bg-background/85 shadow-sm backdrop-blur-sm transition-all hover:scale-110 hover:bg-background"
              onClick={() =>
                onImagePreview({
                  src: question.image.url,
                  alt:
                    question.image.alt ||
                    normalizeMarkdownToText(question.title) ||
                    t('studio.question_image'),
                })
              }
            >
              <ZoomIn className="h-4 w-4" />
              <span className="sr-only">
                {t('runtime.view_image_fullscreen')}
              </span>
            </Button>
          </div>
        ) : null}
        {question.description ? (
          <FormsMarkdown
            content={question.description}
            className={cn(
              'pb-2 transition-colors [&_p]:leading-relaxed',
              validationError ? 'text-dynamic-red/70' : 'text-muted-foreground',
              bodyClassName
            )}
          />
        ) : null}
        {(question.type === 'short_text' || question.type === 'long_text') &&
        getValidationConstraintHint(
          settings,
          t as (key: string, values?: Record<string, string | number>) => string
        ) ? (
          <p
            className={cn(
              'pb-1 text-sm italic opacity-80',
              validationError ? 'text-dynamic-red' : 'text-muted-foreground'
            )}
          >
            {getValidationConstraintHint(
              settings,
              t as (
                key: string,
                values?: Record<string, string | number>
              ) => string
            )}
          </p>
        ) : null}
      </div>

      {question.type === 'short_text' ? (
        <Input
          value={typeof value === 'string' ? value : ''}
          placeholder={settings.placeholder || t('runtime.type_your_answer')}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            toneClasses.fieldClassName,
            validationError
              ? 'border-dynamic-red/50! ring-2! ring-dynamic-red/15! focus-visible:border-dynamic-red! focus-visible:ring-dynamic-red/20!'
              : ''
          )}
          disabled={disabled}
        />
      ) : null}

      {question.type === 'long_text' ? (
        <Textarea
          value={typeof value === 'string' ? value : ''}
          placeholder={settings.placeholder || t('runtime.type_your_answer')}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'min-h-32',
            toneClasses.fieldClassName,
            validationError
              ? 'border-dynamic-red/50! ring-2! ring-dynamic-red/15! focus-visible:border-dynamic-red! focus-visible:ring-dynamic-red/20!'
              : ''
          )}
          disabled={disabled}
        />
      ) : null}

      {renderSingleChoiceField({
        question,
        value,
        onChange,
        onImagePreview,
        disabled,
        validationError,
        toneClasses,
        t,
        choiceLayoutClassName,
        interactionStateClassName,
      })}

      {renderMultipleChoiceField({
        question,
        value,
        onChange,
        onImagePreview,
        disabled,
        validationError,
        toneClasses,
        t,
        choiceLayoutClassName,
        interactionStateClassName,
      })}

      {renderDropdownField({
        question,
        value,
        onChange,
        disabled,
        validationError,
        toneClasses,
        t,
        selectedDropdownOption,
      })}

      {renderScaleField({
        question,
        value,
        onChange,
        disabled,
        validationError,
        toneClasses,
        t,
        displayScaleOptions,
        scaleMin,
        scaleMax,
        scaleMinLabel,
        scaleMaxLabel,
        hasCustomScaleLabels,
        selectedScaleOption,
        selectedScaleLabel,
        selectedScaleNumber,
      })}

      {question.type === 'date' ? (
        <div
          className={cn(
            'space-y-3 rounded-[1.45rem] border bg-background/55 p-4 shadow-sm',
            validationError ? 'border-dynamic-red/40!' : 'border-border/60'
          )}
        >
          <DateTimePicker
            date={parseDateAnswer(value)}
            setDate={(date) => {
              onChange(formatDateAnswer(date));
            }}
            showTimeSelect={false}
            disabled={disabled}
          />
        </div>
      ) : null}

      {question.type === 'time' ? (
        <Select
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onValueChange={(nextValue) => {
            onChange(nextValue);
          }}
        >
          <SelectTrigger
            className={cn(
              toneClasses.fieldClassName,
              validationError
                ? 'border-dynamic-red/50! ring-2! ring-dynamic-red/15! focus:border-dynamic-red! focus:ring-dynamic-red/20!'
                : ''
            )}
          >
            <SelectValue
              placeholder={
                <span
                  className={
                    validationError
                      ? 'text-dynamic-red/70'
                      : 'text-muted-foreground'
                  }
                >
                  {t('runtime.pick_time')}
                </span>
              }
            />
          </SelectTrigger>
          <SelectContent>
            {TIME_OPTIONS.map((time) => (
              <SelectItem key={time} value={time}>
                {time}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {validationError ? (
        <div className="fade-in slide-in-from-top-2 mt-3 animate-in rounded-2xl border border-dynamic-red/25 bg-dynamic-red/10 px-4 py-2.5 transition-all duration-300">
          <p className="font-medium text-dynamic-red text-sm">
            {validationError}
          </p>
        </div>
      ) : null}
    </div>
  );
}
