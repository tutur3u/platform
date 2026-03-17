'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Flag,
  Mail,
  Star,
  ZoomIn,
} from '@tuturuuu/icons';
import { resolveTurnstileClientState } from '@tuturuuu/turnstile/client';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { Input } from '@tuturuuu/ui/input';
import { Progress } from '@tuturuuu/ui/progress';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { Slider } from '@tuturuuu/ui/slider';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEV_MODE } from '@/constants/common';
import { isAnswerableQuestionType } from './block-utils';
import { getNextSectionTarget } from './branching';
import { normalizeMarkdownToText } from './content';
import { FORM_FONT_VARIABLES, getFormFontStyle } from './fonts';
import { FormsImageDialog } from './forms-image-dialog';
import { FormsMarkdown } from './forms-markdown';
import { getRuntimeProgressStats } from './runtime-progress';
import { getFormToneClasses } from './theme';
import type {
  FormAnswerValue,
  FormDefinition,
  FormDefinitionQuestion,
  FormReadOnlyAnswerIssue,
} from './types';
import {
  getBodyTypographyClassName,
  getDisplayTypographyClassName,
  getHeadingTypographyClassName,
} from './typography';
import {
  getValidationConstraintHint,
  validateSubmittedAnswers,
} from './validation';

interface FormRuntimeProps {
  form: FormDefinition;
  mode: 'preview' | 'public';
  initialAnswers?: Record<string, FormAnswerValue>;
  answerIssues?: FormReadOnlyAnswerIssue[];
  submittedAt?: string | null;
  responseCopyEmail?: string | null;
  readOnlyResponseId?: string | null;
  readOnlyResponseSessionId?: string | null;
  canRequestResponseCopy?: boolean;
  responseCopyAlreadySent?: boolean;
  onSubmit?: (payload: {
    answers: Record<string, FormAnswerValue>;
    turnstileToken?: string;
    sendResponseCopy?: boolean;
  }) => Promise<
    | undefined
    | {
        responseCopyRequested?: boolean;
        responseCopyStatus?: 'sent' | 'rate_limited' | 'failed' | null;
        responseCopySentTo?: string | null;
      }
  >;
  onRequestResponseCopy?: (payload: {
    responseId: string;
    sessionId: string;
    turnstileToken?: string;
  }) => Promise<
    | undefined
    | {
        responseCopySentTo?: string | null;
      }
  >;
  isSubmitting?: boolean;
  readOnly?: boolean;
  className?: string;
}

const SUPPORT_EMAIL = 'support@tuturuuu.com';

const densityClasses = {
  airy: {
    cardPadding: 'p-8 sm:p-12',
    sectionGap: 'space-y-20',
    questionGap: 'space-y-16',
  },
  balanced: {
    cardPadding: 'p-6 sm:p-10',
    sectionGap: 'space-y-16',
    questionGap: 'space-y-12',
  },
  compact: {
    cardPadding: 'p-5 sm:p-8',
    sectionGap: 'space-y-12',
    questionGap: 'space-y-10',
  },
} as const;

const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4)
    .toString()
    .padStart(2, '0');
  const minute = ['00', '15', '30', '45'][index % 4] ?? '00';

  return `${hour}:${minute}`;
});

function parseDateAnswer(value: FormAnswerValue | undefined) {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }

  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function formatDateAnswer(date: Date | undefined) {
  if (!date) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function hasOptionImage(option: FormDefinitionQuestion['options'][number]) {
  return Boolean(option.image?.url || option.image?.storagePath);
}

function ExpandableDescriptionPanel({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const t = useTranslations('forms');
  const [expanded, setExpanded] = useState(false);
  const plainText = normalizeMarkdownToText(content);
  const shouldCollapse =
    plainText.length > 180 || plainText.split(/\s+/).length > 30;

  if (!plainText) {
    return null;
  }

  return (
    <div className="space-y-3">
      {expanded || !shouldCollapse ? (
        <FormsMarkdown
          content={content}
          className={cn('text-base text-muted-foreground', className)}
        />
      ) : (
        <p
          className={cn(
            'line-clamp-3 whitespace-pre-wrap text-base text-muted-foreground leading-7',
            className
          )}
        >
          {plainText}
        </p>
      )}
      {shouldCollapse ? (
        <div className="pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-4 font-medium text-muted-foreground text-xs transition-all hover:bg-foreground/5 hover:text-foreground"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded
              ? t('runtime.show_less_description')
              : t('runtime.show_more_description')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FormBrandFooter({ className }: { className?: string }) {
  return (
    <Link
      href="/home"
      aria-label="Go to Tuturuuu home"
      className={cn(
        'group mx-auto flex w-fit items-center gap-3 rounded-full px-2 py-1 text-muted-foreground transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className
      )}
    >
      <TuturuuLogo
        width={32}
        height={32}
        alt="Tuturuuu"
        className="h-8 w-8 object-contain transition-transform duration-200 group-hover:scale-[1.04]"
      />
      <div className="flex translate-y-0.5 flex-col text-left leading-none">
        <span className="text-[10px] uppercase tracking-[0.24em] transition-colors group-hover:text-foreground/80">
          Tuturuuu
        </span>
        <span className="font-semibold text-lg uppercase tracking-[0.08em]">
          Forms
        </span>
      </div>
    </Link>
  );
}

function QuestionBlock({
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

  if (question.type === 'section_break') {
    return (
      <div className="py-2">
        <Separator className="bg-border/60" />
      </div>
    );
  }

  if (question.type === 'divider') {
    return (
      <div className="py-3">
        <Separator className="bg-border/60" />
      </div>
    );
  }

  if (question.type === 'rich_text') {
    return (
      <div className="space-y-3 rounded-[1.6rem] border border-border/60 bg-background/45 p-5 sm:p-6">
        {question.title ? (
          <div className={cn('font-semibold leading-tight', headingClassName)}>
            <FormsMarkdown content={question.title} className="[&_p]:m-0" />
          </div>
        ) : null}
        {question.description ? (
          <FormsMarkdown
            content={question.description}
            className={cn('text-muted-foreground', bodyClassName)}
          />
        ) : null}
      </div>
    );
  }

  if (question.type === 'image') {
    return (
      <div className="space-y-4 rounded-[1.6rem] border border-border/60 bg-background/45 p-5 sm:p-6">
        {question.title ? (
          <div className={cn('font-semibold leading-tight', headingClassName)}>
            <FormsMarkdown content={question.title} className="[&_p]:m-0" />
          </div>
        ) : null}
        {question.image?.url ? (
          <div className="relative aspect-video overflow-hidden rounded-[1.35rem] border border-border/60 bg-background/70">
            <Image
              src={question.image.url}
              alt={
                question.image.alt ||
                normalizeMarkdownToText(question.title) ||
                t('studio.question_image')
              }
              fill
              unoptimized
              className="object-cover"
            />
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute top-4 right-4 h-10 w-10 rounded-full bg-background/85 shadow-sm backdrop-blur-sm"
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
            className={cn('text-muted-foreground', bodyClassName)}
          />
        ) : null}
      </div>
    );
  }

  if (question.type === 'youtube') {
    const videoId = settings.youtubeVideoId;
    const startSeconds = settings.youtubeStartSeconds ?? 0;
    const embedUrl = videoId
      ? `https://www.youtube.com/embed/${videoId}${startSeconds > 0 ? `?start=${startSeconds}` : ''}`
      : '';

    return (
      <div className="space-y-4 rounded-[1.6rem] border border-border/60 bg-background/45 p-5 sm:p-6">
        {question.title ? (
          <div className={cn('font-semibold leading-tight', headingClassName)}>
            <FormsMarkdown content={question.title} className="[&_p]:m-0" />
          </div>
        ) : null}
        {embedUrl ? (
          <div className="overflow-hidden rounded-[1.35rem] border border-border/60 bg-background/70 shadow-sm">
            <div className="aspect-video">
              <iframe
                src={embedUrl}
                title={normalizeMarkdownToText(question.title) || 'YouTube'}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </div>
        ) : null}
        {question.description ? (
          <FormsMarkdown
            content={question.description}
            className={cn('text-muted-foreground', bodyClassName)}
          />
        ) : null}
      </div>
    );
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

      {question.type === 'single_choice' ? (
        <RadioGroup
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onValueChange={(nextValue) => {
            onChange(nextValue);
          }}
          className={choiceLayoutClassName}
        >
          {question.options.map((option) => (
            <label
              key={option.id}
              className={cn(
                'flex h-full rounded-2xl border p-4',
                interactionStateClassName,
                value === option.value
                  ? cn(toneClasses.selectedOptionClassName, 'shadow-md')
                  : validationError
                    ? cn(
                        'border-dynamic-red/30! bg-background/50',
                        disabled ? '' : 'hover:border-dynamic-red/50!'
                      )
                    : cn(
                        toneClasses.optionCardClassName,
                        disabled ? '' : 'hover:shadow-sm'
                      )
              )}
            >
              <div className="flex w-full items-start gap-3">
                <RadioGroupItem
                  value={option.value}
                  id={option.id}
                  className={cn(
                    'mt-1 shrink-0',
                    toneClasses.radioClassName,
                    validationError && value !== option.value
                      ? 'border-dynamic-red/40!'
                      : ''
                  )}
                />
                <div className="min-w-0 flex-1 space-y-3">
                  {hasOptionImage(option) ? (
                    <div
                      className={cn(
                        'relative aspect-16/10 overflow-hidden rounded-[1.15rem] border bg-background/70',
                        validationError && value !== option.value
                          ? 'border-dynamic-red/30!'
                          : 'border-border/60'
                      )}
                    >
                      <Image
                        src={option.image.url}
                        alt={
                          option.image.alt ||
                          normalizeMarkdownToText(option.label) ||
                          option.value
                        }
                        fill
                        unoptimized
                        className="object-cover"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="absolute top-3 right-3 h-9 w-9 rounded-full bg-background/85 shadow-sm backdrop-blur-sm"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onImagePreview({
                            src: option.image.url,
                            alt:
                              option.image.alt ||
                              normalizeMarkdownToText(option.label) ||
                              option.value,
                          });
                        }}
                      >
                        <ZoomIn className="h-4 w-4" />
                        <span className="sr-only">
                          {t('runtime.view_image_fullscreen')}
                        </span>
                      </Button>
                    </div>
                  ) : null}
                  <div className="flex items-start gap-2">
                    <FormsMarkdown
                      content={option.label}
                      className={cn(
                        'min-w-0 font-medium text-sm [&_p]:m-0 [&_p]:leading-6',
                        validationError && value !== option.value
                          ? 'text-dynamic-red/80'
                          : ''
                      )}
                    />
                  </div>
                </div>
              </div>
            </label>
          ))}
        </RadioGroup>
      ) : null}

      {question.type === 'multiple_choice' ? (
        <div className={choiceLayoutClassName}>
          {question.options.map((option) => {
            const checked = Array.isArray(value)
              ? value.includes(option.value)
              : false;

            return (
              <label
                key={option.id}
                className={cn(
                  'flex h-full rounded-2xl border p-4',
                  interactionStateClassName,
                  checked
                    ? cn(toneClasses.selectedOptionClassName, 'shadow-md')
                    : validationError
                      ? cn(
                          'border-dynamic-red/30! bg-background/50',
                          disabled ? '' : 'hover:border-dynamic-red/50!'
                        )
                      : cn(
                          toneClasses.optionCardClassName,
                          disabled ? '' : 'hover:shadow-sm'
                        )
                )}
              >
                <div className="flex w-full items-start gap-3">
                  <Checkbox
                    checked={checked}
                    className={cn(
                      'mt-1 shrink-0',
                      toneClasses.checkboxClassName,
                      validationError && !checked
                        ? 'border-dynamic-red/40!'
                        : ''
                    )}
                    disabled={disabled}
                    onCheckedChange={(nextChecked) => {
                      const nextValue = new Set(
                        Array.isArray(value) ? value : []
                      );
                      if (nextChecked) {
                        nextValue.add(option.value);
                      } else {
                        nextValue.delete(option.value);
                      }
                      onChange([...nextValue]);
                    }}
                  />
                  <div className="min-w-0 flex-1 space-y-3">
                    {hasOptionImage(option) ? (
                      <div
                        className={cn(
                          'relative aspect-16/10 overflow-hidden rounded-[1.15rem] border bg-background/70',
                          validationError && !checked
                            ? 'border-dynamic-red/30!'
                            : 'border-border/60'
                        )}
                      >
                        <Image
                          src={option.image.url}
                          alt={
                            option.image.alt ||
                            normalizeMarkdownToText(option.label) ||
                            option.value
                          }
                          fill
                          unoptimized
                          className="object-cover"
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="absolute top-3 right-3 h-9 w-9 rounded-full bg-background/85 shadow-sm backdrop-blur-sm"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onImagePreview({
                              src: option.image.url,
                              alt:
                                option.image.alt ||
                                normalizeMarkdownToText(option.label) ||
                                option.value,
                            });
                          }}
                        >
                          <ZoomIn className="h-4 w-4" />
                          <span className="sr-only">
                            {t('runtime.view_image_fullscreen')}
                          </span>
                        </Button>
                      </div>
                    ) : null}
                    <div className="flex items-start gap-2">
                      <FormsMarkdown
                        content={option.label}
                        className={cn(
                          'min-w-0 font-medium text-sm [&_p]:m-0 [&_p]:leading-6',
                          validationError && !checked
                            ? 'text-dynamic-red/80'
                            : ''
                        )}
                      />
                    </div>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      ) : null}

      {question.type === 'dropdown' ? (
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
            {typeof value === 'string' && value ? (
              <div className="flex min-w-0 items-center gap-2">
                {selectedDropdownOption &&
                hasOptionImage(selectedDropdownOption) ? (
                  <div
                    className={cn(
                      'relative h-8 w-8 shrink-0 overflow-hidden rounded-xl border bg-background/70',
                      validationError
                        ? 'border-dynamic-red/30!'
                        : 'border-border/60'
                    )}
                  >
                    <Image
                      src={selectedDropdownOption.image.url}
                      alt={
                        selectedDropdownOption.image.alt ||
                        selectedDropdownOption.value ||
                        t('runtime.choose_option')
                      }
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  </div>
                ) : null}
                <FormsMarkdown
                  content={selectedDropdownOption?.label ?? value}
                  variant="inline"
                  className="min-w-0 truncate text-left text-sm"
                />
              </div>
            ) : (
              <span
                className={
                  validationError
                    ? 'text-dynamic-red/70'
                    : 'text-muted-foreground'
                }
              >
                {t('runtime.choose_option')}
              </span>
            )}
          </SelectTrigger>
          <SelectContent>
            {question.options.map((option) => (
              <SelectItem key={option.id} value={option.value}>
                <div className="flex min-w-0 items-center gap-2">
                  {hasOptionImage(option) ? (
                    <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-background/70">
                      <Image
                        src={option.image.url}
                        alt={
                          option.image.alt ||
                          normalizeMarkdownToText(option.label) ||
                          option.value
                        }
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                  ) : null}
                  <FormsMarkdown
                    content={option.label}
                    variant="inline"
                    className="min-w-0 text-sm"
                  />
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {question.type === 'linear_scale' || question.type === 'rating' ? (
        <div
          className={cn(
            'space-y-4 rounded-[1.6rem] border bg-background/45 p-4 transition-all sm:p-5',
            validationError
              ? 'border-dynamic-red/40! bg-dynamic-red/5'
              : 'border-border/60'
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="space-y-1">
                <p
                  className={cn(
                    'text-[11px] uppercase tracking-[0.22em]',
                    validationError
                      ? 'text-dynamic-red/80'
                      : 'text-muted-foreground'
                  )}
                >
                  {question.type === 'rating'
                    ? t('question_type.rating')
                    : t('question_type.linear_scale')}
                </p>
                <p
                  className={cn(
                    'text-sm',
                    validationError
                      ? 'text-dynamic-red/70'
                      : 'text-muted-foreground'
                  )}
                >
                  {scaleMin} - {scaleMax}
                </p>
              </div>
            </div>
            <div
              className={cn(
                'rounded-full border bg-background/70 px-3 py-1.5 text-sm shadow-sm',
                validationError
                  ? 'border-dynamic-red/30! text-dynamic-red'
                  : 'border-border/60 text-foreground'
              )}
            >
              {selectedScaleOption ? (
                question.type === 'rating' ? (
                  <span className="font-semibold">
                    {selectedScaleNumber}/{scaleMax}
                  </span>
                ) : (
                  <span className="font-semibold">
                    {selectedScaleOption.value}
                  </span>
                )
              ) : (
                <span
                  className={
                    validationError
                      ? 'text-dynamic-red/60'
                      : 'text-muted-foreground'
                  }
                >
                  {t('runtime.choose_option')}
                </span>
              )}
            </div>
          </div>

          {question.type === 'linear_scale' ? (
            <div
              className={cn(
                'rounded-[1.45rem] border bg-background/55 p-4 shadow-sm',
                validationError ? 'border-dynamic-red/20!' : 'border-border/60'
              )}
            >
              <Slider
                value={[
                  Number.isNaN(selectedScaleNumber)
                    ? scaleMin
                    : selectedScaleNumber,
                ]}
                min={scaleMin}
                max={scaleMax}
                step={1}
                disabled={disabled}
                onValueChange={(nextValue) => {
                  const nextScore = nextValue[0];
                  if (typeof nextScore !== 'number') {
                    return;
                  }

                  onChange(String(nextScore));
                }}
                className={cn(
                  'px-1 py-4 **:data-[slot=slider-thumb]:h-5 **:data-[slot=slider-thumb]:w-5 **:data-[slot=slider-thumb]:border-2 **:data-[slot=slider-thumb]:border-current **:data-[slot=slider-range]:bg-current **:data-[slot=slider-thumb]:bg-background',
                  selectedScaleLabel
                    ? validationError
                      ? 'text-dynamic-red'
                      : 'text-foreground'
                    : 'text-muted-foreground',
                  validationError && !selectedScaleLabel
                    ? 'text-dynamic-red/40'
                    : ''
                )}
              />
              <div className="mt-3 grid gap-2 sm:grid-cols-5">
                {displayScaleOptions.map((option) => {
                  const active = String(value ?? '') === option.value;
                  const plainOptionLabel = normalizeMarkdownToText(
                    option.label
                  );
                  const showLabel =
                    plainOptionLabel.trim() !== option.value.trim();

                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (active) {
                          onChange('');
                          return;
                        }
                        onChange(option.value);
                      }}
                      className={cn(
                        'rounded-[1.15rem] border px-3 py-3 text-left focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        disabled
                          ? 'cursor-default opacity-75'
                          : 'transition-all duration-300 hover:scale-[1.05] active:scale-[0.95]',
                        active
                          ? cn(
                              toneClasses.selectedOptionClassName,
                              'shadow-sm ring-1 ring-current/20'
                            )
                          : validationError
                            ? cn(
                                'border-dynamic-red/25 bg-background/40',
                                disabled
                                  ? ''
                                  : 'hover:border-dynamic-red/40! hover:bg-background/60'
                              )
                            : cn(
                                toneClasses.optionCardClassName,
                                disabled
                                  ? ''
                                  : 'hover:border-foreground/20 hover:bg-background/80 hover:shadow-sm'
                              )
                      )}
                      aria-label={showLabel ? plainOptionLabel : option.value}
                      aria-pressed={active}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className={cn(
                            'font-semibold text-base',
                            active
                              ? ''
                              : validationError
                                ? 'text-dynamic-red/70'
                                : ''
                          )}
                        >
                          {option.value}
                        </span>
                        {active ? <Check className="h-4 w-4" /> : null}
                      </div>
                      {showLabel ? (
                        <FormsMarkdown
                          content={option.label}
                          className={cn(
                            'mt-1.5 line-clamp-2 text-xs leading-4 [&_p]:m-0',
                            active
                              ? ''
                              : validationError
                                ? 'text-dynamic-red/60'
                                : 'text-muted-foreground'
                          )}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-muted-foreground text-xs">
                <span className="truncate">{scaleMinLabel}</span>
                <span className="truncate text-right">{scaleMaxLabel}</span>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                'rounded-[1.45rem] border bg-background/55 p-5 shadow-sm',
                validationError ? 'border-dynamic-red/20!' : 'border-border/60'
              )}
            >
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                {displayScaleOptions.map((option) => {
                  const score = Number(option.value);
                  const active =
                    !Number.isNaN(score) &&
                    !Number.isNaN(selectedScaleNumber) &&
                    score <= selectedScaleNumber;
                  const selected = String(value ?? '') === option.value;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (selected) {
                          onChange('');
                          return;
                        }
                        onChange(option.value);
                      }}
                      className={cn(
                        'group flex h-14 w-14 items-center justify-center rounded-[1.15rem] border focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        disabled
                          ? 'cursor-default opacity-75'
                          : 'transition-all duration-300 hover:scale-[1.1] hover:border-foreground/20 active:scale-[0.9]',
                        selected
                          ? cn(
                              toneClasses.selectedOptionClassName,
                              'shadow-sm ring-1 ring-current/20'
                            )
                          : validationError
                            ? cn(
                                'border-dynamic-red/25! bg-background/40',
                                disabled
                                  ? ''
                                  : 'hover:border-dynamic-red/40! hover:bg-background/60'
                              )
                            : cn(
                                toneClasses.optionCardClassName,
                                disabled
                                  ? ''
                                  : 'hover:bg-background/80 hover:shadow-sm'
                              )
                      )}
                      aria-label={normalizeMarkdownToText(option.label)}
                      aria-pressed={selected}
                    >
                      <Star
                        className={cn(
                          'h-7 w-7 transition',
                          selected
                            ? 'fill-current'
                            : active
                              ? 'fill-current/60'
                              : 'fill-transparent',
                          validationError && !active
                            ? 'text-dynamic-red/40'
                            : ''
                        )}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-muted-foreground text-xs">
                <span className="truncate">{scaleMinLabel}</span>
                <span className="truncate text-right">{scaleMaxLabel}</span>
              </div>
              {hasCustomScaleLabels &&
              selectedScaleOption &&
              selectedScaleOption.label !== selectedScaleOption.value ? (
                <FormsMarkdown
                  content={selectedScaleOption.label}
                  className={cn(
                    'mt-3 text-center text-sm [&_p]:m-0',
                    validationError
                      ? 'text-dynamic-red/70'
                      : 'text-muted-foreground'
                  )}
                />
              ) : null}
            </div>
          )}
        </div>
      ) : null}

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

export function FormRuntime({
  form,
  mode,
  initialAnswers,
  answerIssues = [],
  submittedAt,
  responseCopyEmail,
  readOnlyResponseId,
  readOnlyResponseSessionId,
  canRequestResponseCopy = false,
  responseCopyAlreadySent = false,
  onSubmit,
  onRequestResponseCopy,
  isSubmitting = false,
  readOnly = false,
  className,
}: FormRuntimeProps) {
  const t = useTranslations('forms');
  const [answers, setAnswers] = useState<Record<string, FormAnswerValue>>(
    initialAnswers ?? {}
  );
  const answersRef = useRef<Record<string, FormAnswerValue>>(
    initialAnswers ?? {}
  );
  const [currentSectionId, setCurrentSectionId] = useState(
    form.sections[0]?.id ?? ''
  );
  const [sectionTrail, setSectionTrail] = useState<string[]>(
    form.sections[0]?.id ? [form.sections[0].id] : []
  );
  const [error, setError] = useState<string | null>(null);
  const [validationErrorsByQuestionId, setValidationErrorsByQuestionId] =
    useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [sendResponseCopy, setSendResponseCopy] = useState(false);
  const [submittedResponseCopyEmail, setSubmittedResponseCopyEmail] = useState<
    string | null
  >(null);
  const [submittedResponseCopyStatus, setSubmittedResponseCopyStatus] =
    useState<'sent' | 'rate_limited' | 'failed' | null>(null);
  const [submittedResponseCopyRequested, setSubmittedResponseCopyRequested] =
    useState(false);
  const [isRequestingResponseCopy, setIsRequestingResponseCopy] =
    useState(false);
  const [readOnlyResponseCopySentTo, setReadOnlyResponseCopySentTo] = useState<
    string | null
  >(responseCopyAlreadySent ? (responseCopyEmail ?? null) : null);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [captchaError, setCaptchaError] = useState<string>();
  const [previewImage, setPreviewImage] = useState<{
    src: string;
    alt: string;
  } | null>(null);
  const captchaRef = useRef<TurnstileInstance | null>(null);
  const sectionCardRef = useRef<HTMLDivElement | null>(null);
  const previousSectionIdRef = useRef(currentSectionId);

  const toneClasses = getFormToneClasses(form.theme.accentColor);
  const bodyFontStyle = getFormFontStyle(form.theme.bodyFontId);
  const headlineFontStyle = getFormFontStyle(form.theme.headlineFontId);
  const displayTypographyClassName = getDisplayTypographyClassName(
    form.theme.typography.displaySize
  );
  const headingTypographyClassName = getHeadingTypographyClassName(
    form.theme.typography.headingSize
  );
  const bodyTypographyClassName = getBodyTypographyClassName(
    form.theme.typography.bodySize
  );
  const density = densityClasses[form.theme.density];
  const turnstileClientState = resolveTurnstileClientState({
    devMode: DEV_MODE,
    siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  });
  const turnstileSiteKey = turnstileClientState.siteKey;
  const requiresTurnstile =
    mode === 'public' && turnstileClientState.isRequired;
  const currentSectionIndex = form.sections.findIndex(
    (section) => section.id === currentSectionId
  );
  const currentSection = form.sections[currentSectionIndex] ?? form.sections[0];
  const visibleSectionTitle =
    currentSection?.title ||
    t('studio.section_number', { count: currentSectionIndex + 1 });
  const activeAnswers = answersRef.current;
  const progressStats = useMemo(
    () =>
      getRuntimeProgressStats(
        form,
        answers,
        sectionTrail,
        currentSection?.id ?? ''
      ),
    [answers, currentSection?.id, form, sectionTrail]
  );

  const requiredQuestionIds = useMemo(
    () =>
      new Set(
        currentSection?.questions
          .filter(
            (question) =>
              question.required && isAnswerableQuestionType(question.type)
          )
          .map((question) => question.id)
      ),
    [currentSection]
  );
  const advanceTarget = currentSection
    ? readOnly
      ? form.sections[currentSectionIndex + 1]
        ? {
            type: 'next' as const,
            targetSectionId: form.sections[currentSectionIndex + 1]?.id,
          }
        : { type: 'submit' as const }
      : getNextSectionTarget(form, currentSection.id, activeAnswers)
    : { type: 'submit' as const };
  const advanceSectionTitle =
    advanceTarget.type === 'section'
      ? normalizeMarkdownToText(
          form.sections.find(
            (section) => section.id === advanceTarget.targetSectionId
          )?.title
        )
      : advanceTarget.type === 'next'
        ? normalizeMarkdownToText(form.sections[currentSectionIndex + 1]?.title)
        : null;
  const questionIdSet = useMemo(
    () =>
      new Set(
        form.sections.flatMap((section) =>
          section.questions.map((question) => question.id)
        )
      ),
    [form.sections]
  );
  const answerIssueMap = useMemo(
    () =>
      answerIssues.reduce<Map<string, FormReadOnlyAnswerIssue[]>>(
        (accumulator, issue) => {
          if (!issue.questionId || !questionIdSet.has(issue.questionId)) {
            return accumulator;
          }

          const currentIssues = accumulator.get(issue.questionId) ?? [];
          currentIssues.push(issue);
          accumulator.set(issue.questionId, currentIssues);
          return accumulator;
        },
        new Map()
      ),
    [answerIssues, questionIdSet]
  );
  const missingQuestionIssues = useMemo(
    () =>
      answerIssues.filter(
        (issue) => !issue.questionId || !questionIdSet.has(issue.questionId)
      ),
    [answerIssues, questionIdSet]
  );
  const hasReadOnlyNextSection =
    readOnly && Boolean(advanceTarget.targetSectionId);
  const canTriggerReadOnlyResponseCopy = Boolean(
    readOnly &&
      canRequestResponseCopy &&
      onRequestResponseCopy &&
      readOnlyResponseId &&
      readOnlyResponseSessionId &&
      !readOnlyResponseCopySentTo
  );
  const shouldShowTurnstile =
    requiresTurnstile &&
    ((!readOnly && advanceTarget.type === 'submit') ||
      canTriggerReadOnlyResponseCopy);
  const shouldShowSectionNavigation =
    !readOnly || sectionTrail.length > 1 || hasReadOnlyNextSection;
  const isSubmitBlockedByTurnstile =
    !readOnly && shouldShowTurnstile && !captchaToken;
  const isResponseCopyBlockedByTurnstile =
    readOnly &&
    canTriggerReadOnlyResponseCopy &&
    requiresTurnstile &&
    !captchaToken;
  const isBusy = isSubmitting || isRequestingResponseCopy;

  const draftKey = `tuturuuu_form_draft_${form.id}`;

  // Load draft from localStorage on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional run on mount
  useEffect(() => {
    if (mode !== 'public' || readOnly || submittedAt) {
      return;
    }

    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.answers && Object.keys(parsed.answers).length > 0) {
          const mergedAnswers = {
            ...(initialAnswers ?? {}),
            ...parsed.answers,
          };
          setAnswers(mergedAnswers);
          answersRef.current = mergedAnswers;
        }
        if (
          parsed.currentSectionId &&
          form.sections.some((s) => s.id === parsed.currentSectionId)
        ) {
          setCurrentSectionId(parsed.currentSectionId);
        }
        if (parsed.sectionTrail && Array.isArray(parsed.sectionTrail)) {
          const validTrail = parsed.sectionTrail.filter((id: string) =>
            form.sections.some((s) => s.id === id)
          );
          if (validTrail.length > 0) {
            setSectionTrail(validTrail);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load form draft from local storage', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save draft to localStorage when answers/section changes
  useEffect(() => {
    if (mode !== 'public' || readOnly || submittedAt || isSubmitting) {
      return;
    }

    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          answers,
          currentSectionId,
          sectionTrail,
        })
      );
    } catch (err) {
      console.warn('Failed to save form draft to local storage', err);
    }
  }, [
    answers,
    currentSectionId,
    sectionTrail,
    mode,
    readOnly,
    submittedAt,
    isSubmitting,
    draftKey,
  ]);

  useEffect(() => {
    const nextAnswers = initialAnswers ?? {};
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
  }, [initialAnswers]);

  useEffect(() => {
    if (responseCopyEmail) {
      return;
    }

    setSendResponseCopy(false);
  }, [responseCopyEmail]);

  useEffect(() => {
    setReadOnlyResponseCopySentTo(
      responseCopyAlreadySent ? (responseCopyEmail ?? null) : null
    );
  }, [responseCopyAlreadySent, responseCopyEmail]);

  useEffect(() => {
    if (shouldShowTurnstile) {
      return;
    }

    setCaptchaToken(undefined);
    setCaptchaError(undefined);
    captchaRef.current?.reset();
  }, [shouldShowTurnstile]);

  useEffect(() => {
    if (previousSectionIdRef.current === currentSectionId) {
      return;
    }

    previousSectionIdRef.current = currentSectionId;
    requestAnimationFrame(() => {
      sectionCardRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, [currentSectionId]);

  if (!currentSection) {
    return null;
  }

  const updateAnswer = (questionId: string, value: FormAnswerValue) => {
    const nextAnswers = {
      ...answersRef.current,
      [questionId]: value,
    };

    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    setError(null);
    setValidationErrorsByQuestionId((prev) => {
      if (!(questionId in prev)) return prev;
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  const validateCurrentSection = (
    currentAnswers: Record<string, FormAnswerValue>
  ) => {
    const missingRequiredQuestions =
      currentSection?.questions.filter((question) => {
        if (!requiredQuestionIds.has(question.id)) {
          return false;
        }

        const value = currentAnswers[question.id];
        if (Array.isArray(value)) {
          return value.length === 0;
        }

        return value == null || value === '';
      }) ?? [];

    if (missingRequiredQuestions.length > 0) {
      const firstMissing = missingRequiredQuestions[0]!;
      setError(
        t('runtime.required_before_continue', {
          title: normalizeMarkdownToText(firstMissing.title),
        })
      );

      const nextErrors: Record<string, string> = {};
      for (const question of missingRequiredQuestions) {
        nextErrors[question.id] = t('runtime.required');
      }

      setValidationErrorsByQuestionId((prev) => ({
        ...prev,
        ...nextErrors,
      }));

      // Scroll to the first missing required question
      requestAnimationFrame(() => {
        const element = document.getElementById(`question-${firstMissing.id}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });

      return false;
    }

    return true;
  };

  const handleAdvance = async () => {
    if (isBusy) {
      return;
    }

    const currentAnswers = answersRef.current;

    if (!readOnly && !validateCurrentSection(currentAnswers)) {
      return;
    }

    const target = readOnly
      ? advanceTarget
      : getNextSectionTarget(form, currentSection.id, currentAnswers);

    if (readOnly) {
      if (target.targetSectionId) {
        setCurrentSectionId(target.targetSectionId);
        setSectionTrail((currentTrail) =>
          currentTrail.at(-1) === target.targetSectionId
            ? currentTrail
            : [...currentTrail, target.targetSectionId!]
        );
        setError(null);
      }
      return;
    }

    if (target.type === 'submit') {
      const validation = validateSubmittedAnswers(form, currentAnswers);
      if (!validation.valid) {
        const errors = validation.validationErrorsByQuestionId ?? {};
        setValidationErrorsByQuestionId(errors);

        if (validation.missingRequired.length > 0) {
          setError(
            t('runtime.missing_required_answers', {
              items: validation.missingRequired.join(', '),
            })
          );
        } else if (validation.validationErrors.length > 0) {
          setError(validation.validationErrors[0] ?? null);
        } else {
          setError(null);
        }

        // Scroll to the first error if it's in the current section
        const firstErrorId = Object.keys(errors)[0];
        if (firstErrorId) {
          requestAnimationFrame(() => {
            const element = document.getElementById(`question-${firstErrorId}`);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          });
        }

        return;
      }

      if (!onSubmit) {
        setSubmitted(true);
        return;
      }

      if (requiresTurnstile && !turnstileSiteKey) {
        setError(t('runtime.turnstile_not_configured'));
        return;
      }

      if (requiresTurnstile && !captchaToken) {
        setError(t('runtime.turnstile_required'));
        return;
      }

      const submitResult = await onSubmit({
        answers: currentAnswers,
        turnstileToken: captchaToken,
        sendResponseCopy: Boolean(responseCopyEmail && sendResponseCopy),
      });

      try {
        localStorage.removeItem(draftKey);
      } catch (err) {
        console.warn('Failed to clear form draft from local storage', err);
      }

      captchaRef.current?.reset();
      setCaptchaToken(undefined);
      setSubmittedResponseCopyRequested(
        submitResult?.responseCopyRequested ??
          Boolean(responseCopyEmail && sendResponseCopy)
      );
      setSubmittedResponseCopyStatus(
        submitResult?.responseCopyStatus ??
          (submitResult?.responseCopySentTo ? 'sent' : null)
      );
      setSubmittedResponseCopyEmail(submitResult?.responseCopySentTo ?? null);
      setSubmitted(true);
      return;
    }

    if (target.targetSectionId) {
      setCurrentSectionId(target.targetSectionId);
      setSectionTrail((currentTrail) =>
        currentTrail.at(-1) === target.targetSectionId
          ? currentTrail
          : [...currentTrail, target.targetSectionId!]
      );
      setError(null);
      setValidationErrorsByQuestionId({});
    }
  };

  const handleReadOnlyResponseCopy = async () => {
    if (
      isBusy ||
      !onRequestResponseCopy ||
      !readOnlyResponseId ||
      !readOnlyResponseSessionId
    ) {
      return;
    }

    if (requiresTurnstile && !turnstileSiteKey) {
      setError(t('runtime.turnstile_not_configured'));
      return;
    }

    if (requiresTurnstile && !captchaToken) {
      setError(t('runtime.turnstile_required'));
      return;
    }

    setIsRequestingResponseCopy(true);
    setError(null);

    try {
      const result = await onRequestResponseCopy({
        responseId: readOnlyResponseId,
        sessionId: readOnlyResponseSessionId,
        turnstileToken: captchaToken,
      });

      setReadOnlyResponseCopySentTo(
        result?.responseCopySentTo ?? responseCopyEmail ?? null
      );
      captchaRef.current?.reset();
      setCaptchaToken(undefined);
    } finally {
      setIsRequestingResponseCopy(false);
    }
  };

  if (submitted) {
    return (
      <div
        className={cn(
          'flex min-h-screen items-center justify-center px-4 py-10',
          FORM_FONT_VARIABLES,
          toneClasses.pageClassName,
          className
        )}
        style={bodyFontStyle}
      >
        <div className="relative w-full max-w-2xl">
          {/* Subtle ambient glows */}
          <div
            className={cn(
              'absolute -top-24 -left-24 h-64 w-64 rounded-full opacity-10 blur-[80px]',
              toneClasses.progressIndicatorClassName
            )}
          />
          <div
            className={cn(
              'absolute -right-24 -bottom-24 h-64 w-64 rounded-full opacity-10 blur-[80px]',
              toneClasses.progressIndicatorClassName
            )}
          />

          <Card
            className={cn(
              'relative overflow-hidden border-0 shadow-2xl',
              toneClasses.cardClassName
            )}
          >
            <div
              className={cn(
                'absolute inset-x-0 top-0 h-1.5',
                toneClasses.progressIndicatorClassName
              )}
            />
            <CardContent className="flex flex-col items-center space-y-8 p-10 text-center sm:p-16">
              <div
                className={cn(
                  'flex h-20 w-20 items-center justify-center rounded-3xl border-2 border-background/50 shadow-lg transition-transform duration-500 hover:scale-110',
                  toneClasses.iconClassName
                )}
              >
                <Check className="h-10 w-10 stroke-[2.5]" />
              </div>

              <div className="space-y-4">
                <h2
                  className={cn(
                    'font-bold tracking-tight',
                    displayTypographyClassName
                  )}
                  style={headlineFontStyle}
                >
                  {form.settings.confirmationTitle ||
                    t('runtime.form_submitted')}
                </h2>
                <div
                  className={cn(
                    'mx-auto max-w-md text-muted-foreground leading-relaxed',
                    bodyTypographyClassName
                  )}
                >
                  <FormsMarkdown
                    content={
                      form.settings.confirmationMessage ||
                      t('runtime.form_submitted_description')
                    }
                  />
                </div>
              </div>

              {submittedResponseCopyRequested ? (
                <div
                  className={cn(
                    'w-full max-w-lg rounded-[1.6rem] border px-5 py-4 text-left',
                    submittedResponseCopyEmail
                      ? 'border-dynamic-green/20 bg-dynamic-green/8'
                      : 'border-dynamic-orange/20 bg-dynamic-orange/10'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Mail
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        submittedResponseCopyEmail
                          ? 'text-dynamic-green'
                          : 'text-dynamic-orange'
                      )}
                    />
                    <div className="space-y-1">
                      <p className="font-medium text-sm">
                        {submittedResponseCopyEmail
                          ? t('runtime.response_copy_sent_title')
                          : submittedResponseCopyStatus === 'rate_limited'
                            ? t('runtime.response_copy_not_sent_title')
                            : t('runtime.response_copy_delivery_help_title')}
                      </p>
                      <p className="text-muted-foreground text-sm leading-6">
                        {submittedResponseCopyEmail
                          ? t('runtime.response_copy_sent_description', {
                              email: submittedResponseCopyEmail,
                            })
                          : submittedResponseCopyStatus === 'rate_limited'
                            ? t(
                                'runtime.response_copy_rate_limited_description'
                              )
                            : submittedResponseCopyStatus === 'failed'
                              ? t('runtime.response_copy_failed_description')
                              : t('runtime.response_copy_support_note', {
                                  email: SUPPORT_EMAIL,
                                })}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="pt-4">
                <Button
                  variant="outline"
                  size="lg"
                  className={cn(
                    'h-12 rounded-full px-8 font-medium transition-all hover:bg-foreground/5 hover:shadow-sm active:scale-95',
                    toneClasses.secondaryButtonClassName
                  )}
                  onClick={() => window.location.reload()}
                >
                  {t('runtime.submit_another')}
                </Button>
              </div>

              <FormBrandFooter className="mt-2" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'min-h-screen py-10',
        FORM_FONT_VARIABLES,
        toneClasses.pageClassName,
        className
      )}
      style={bodyFontStyle}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4">
        <Card
          className={cn('overflow-hidden border-0', toneClasses.heroClassName)}
        >
          {form.theme.coverImage.url ? (
            <div className="relative aspect-video w-full overflow-hidden md:aspect-16/6">
              <Image
                src={form.theme.coverImage.url}
                alt={
                  form.theme.coverImage.alt ||
                  normalizeMarkdownToText(form.title)
                }
                fill
                unoptimized
                className="object-cover"
              />
              <div className="absolute inset-0 bg-linear-to-t from-background via-background/35 to-transparent" />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute top-4 right-4 h-10 w-10 rounded-full bg-background/85 shadow-sm backdrop-blur-sm"
                onClick={() =>
                  setPreviewImage({
                    src: form.theme.coverImage.url,
                    alt:
                      form.theme.coverImage.alt ||
                      normalizeMarkdownToText(form.title),
                  })
                }
              >
                <ZoomIn className="h-4 w-4" />
                <span className="sr-only">
                  {t('runtime.view_image_fullscreen')}
                </span>
              </Button>
              <div className="absolute inset-x-0 bottom-0 p-6 lg:p-8">
                <div className="space-y-3">
                  <div
                    className={cn(
                      'max-w-4xl font-semibold text-primary-foreground leading-tight',
                      displayTypographyClassName
                    )}
                    style={headlineFontStyle}
                  >
                    <FormsMarkdown
                      content={form.theme.coverHeadline || form.title}
                      className="[&_a]:text-primary-foreground [&_p]:m-0 [&_p]:leading-tight"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          <CardContent className="space-y-5 p-6 lg:p-8">
            {!form.theme.coverImage.url ? (
              <div className="space-y-5">
                <div className="space-y-3">
                  <div
                    className={cn(
                      'font-semibold leading-tight',
                      displayTypographyClassName
                    )}
                    style={headlineFontStyle}
                  >
                    <FormsMarkdown
                      content={form.theme.coverHeadline || form.title}
                      className="[&_p]:m-0 [&_p]:leading-tight"
                    />
                  </div>
                </div>
              </div>
            ) : null}
            {form.description ? (
              <div className="rounded-[1.65rem] border border-border/60 bg-background/45 p-5 sm:p-6">
                <ExpandableDescriptionPanel content={form.description} />
              </div>
            ) : null}
            {form.settings.showProgressBar ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] uppercase tracking-[0.25em] opacity-60">
                  <span>{t('runtime.completion')}</span>
                  <span>
                    {t('runtime.questions_completed', {
                      completed: progressStats.completedCount,
                      total: progressStats.totalQuestions,
                    })}
                  </span>
                </div>
                <Progress
                  value={progressStats.progressValue}
                  className={cn('h-2.5', toneClasses.progressClassName)}
                  indicatorClassName={toneClasses.progressIndicatorClassName}
                />
                <div className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-xs">
                  <span>{Math.round(progressStats.progressValue)}%</span>
                  <span>
                    {t('runtime.progress_breakdown', {
                      filled: progressStats.answeredCount,
                      skipped: progressStats.skippedCount,
                    })}
                  </span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {form.accessMode === 'authenticated_email' ? (
          <div className="mx-auto flex w-full max-w-5xl items-center gap-3 rounded-2xl border border-border/50 bg-card/60 px-5 py-3 text-muted-foreground text-sm">
            <Mail className="h-4 w-4 shrink-0" />
            {t('runtime.email_tracked_notice')}
          </div>
        ) : null}

        {readOnly ? (
          <div className="mx-auto w-full max-w-5xl space-y-3">
            <div className="flex items-start gap-3 rounded-2xl border border-dynamic-orange/20 bg-dynamic-orange/10 px-5 py-3 text-dynamic-orange text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <p>{t('runtime.already_responded')}</p>
                {submittedAt ? (
                  <p className="text-xs opacity-80">
                    {t('runtime.response_recorded_at', {
                      time: new Date(submittedAt).toLocaleString(),
                    })}
                  </p>
                ) : null}
              </div>
            </div>
            {readOnlyResponseCopySentTo ? (
              <div className="flex items-center gap-2 rounded-2xl border border-dynamic-green/20 bg-dynamic-green/8 px-4 py-3 text-sm">
                <Check className="h-4 w-4 shrink-0 text-dynamic-green" />
                <p className="text-muted-foreground leading-6">
                  {t('runtime.response_copy_sent_description', {
                    email: readOnlyResponseCopySentTo,
                  })}
                </p>
              </div>
            ) : (
              <div className="rounded-[1.65rem] border border-border/60 bg-linear-to-br from-background/95 via-background/80 to-background/55 p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-2xl',
                          toneClasses.iconClassName
                        )}
                      >
                        <Mail className="h-4 w-4" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-sm">
                          {t('runtime.response_copy_title')}
                        </p>
                        <p className="text-muted-foreground text-sm leading-6">
                          {t('runtime.response_copy_read_only_description')}
                        </p>
                      </div>
                    </div>
                    {responseCopyEmail ? (
                      <div className="inline-flex rounded-full border border-border/60 bg-background/85 px-3 py-1.5 font-medium text-xs">
                        {t('runtime.response_copy_email_badge', {
                          email: responseCopyEmail,
                        })}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm leading-6">
                        {t('runtime.response_copy_unavailable')}
                      </p>
                    )}
                  </div>

                  <div className="flex min-w-62 flex-col items-stretch gap-3 lg:max-w-xs">
                    <Button
                      type="button"
                      className={toneClasses.primaryButtonClassName}
                      onClick={handleReadOnlyResponseCopy}
                      disabled={
                        !canTriggerReadOnlyResponseCopy ||
                        isBusy ||
                        isResponseCopyBlockedByTurnstile
                      }
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      {t('runtime.response_copy_send_now')}
                    </Button>
                    <p className="text-muted-foreground text-xs leading-6">
                      {responseCopyEmail
                        ? t('runtime.response_copy_once_only')
                        : t('runtime.response_copy_login_required_hint')}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-muted-foreground text-xs leading-6">
                  {t('runtime.response_copy_support_note', {
                    email: SUPPORT_EMAIL,
                  })}
                </p>
              </div>
            )}
            {missingQuestionIssues.length > 0 ? (
              <div className="rounded-2xl border border-dynamic-orange/20 bg-background/55 px-5 py-4">
                <p className="font-medium text-dynamic-orange text-sm">
                  {t('runtime.some_answers_need_review')}
                </p>
                <div className="mt-3 space-y-2">
                  {missingQuestionIssues.map((issue, index) => (
                    <div
                      key={`${issue.questionTitle}-${index}`}
                      className="rounded-xl border border-border/50 bg-background/70 px-3 py-2"
                    >
                      <p className="font-medium text-sm">
                        {issue.questionTitle}
                      </p>
                      <p className="mt-1 text-muted-foreground text-sm">
                        {t('runtime.unmatched_answer_hint', {
                          value: issue.originalAnswer,
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <Card
          ref={sectionCardRef}
          className={cn('mx-auto w-full border-0', toneClasses.cardClassName)}
        >
          <CardHeader className={density.cardPadding}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div
                  className={cn(
                    'font-semibold leading-tight',
                    headingTypographyClassName
                  )}
                >
                  <FormsMarkdown
                    content={visibleSectionTitle}
                    className="[&_p]:m-0 [&_p]:leading-tight"
                  />
                </div>
              </div>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                <Flag className="mr-1 h-3.5 w-3.5" />
                {progressStats.currentSectionNumber} /{' '}
                {progressStats.routeSectionCount}
              </Badge>
            </div>
            {currentSection.image.url ? (
              <div className="relative mt-4 aspect-16/6 overflow-hidden rounded-[1.4rem] border border-border/60 bg-background/70">
                <Image
                  src={currentSection.image.url}
                  alt={
                    currentSection.image.alt ||
                    normalizeMarkdownToText(currentSection.title) ||
                    normalizeMarkdownToText(visibleSectionTitle)
                  }
                  fill
                  unoptimized
                  className="object-cover"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute top-4 right-4 h-10 w-10 rounded-full bg-background/85 shadow-sm backdrop-blur-sm"
                  onClick={() =>
                    setPreviewImage({
                      src: currentSection.image.url,
                      alt:
                        currentSection.image.alt ||
                        normalizeMarkdownToText(currentSection.title) ||
                        normalizeMarkdownToText(visibleSectionTitle),
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
          </CardHeader>
          <CardContent className={cn(density.cardPadding, density.sectionGap)}>
            {currentSection.description ? (
              <div className="rounded-[1.45rem] border border-border/60 bg-background/45 p-4 sm:p-5">
                <ExpandableDescriptionPanel
                  content={currentSection.description}
                  className={bodyTypographyClassName}
                />
              </div>
            ) : null}
            <div className={density.questionGap}>
              {currentSection.questions.map((question) => (
                <QuestionBlock
                  key={question.id}
                  question={question}
                  value={answers[question.id]}
                  onChange={(value) => updateAnswer(question.id, value)}
                  onImagePreview={(image) => setPreviewImage(image)}
                  disabled={isBusy || readOnly}
                  validationError={validationErrorsByQuestionId[question.id]}
                  toneClasses={toneClasses}
                  typography={form.theme.typography}
                />
              ))}
              {readOnly &&
              currentSection.questions.some(
                (question) => (answerIssueMap.get(question.id) ?? []).length > 0
              )
                ? currentSection.questions.map((question) => {
                    const issues = answerIssueMap.get(question.id) ?? [];
                    if (issues.length === 0) {
                      return null;
                    }

                    return (
                      <div
                        key={`${question.id}-unmatched`}
                        className="rounded-2xl border border-dynamic-orange/20 bg-dynamic-orange/8 px-4 py-3 text-sm"
                      >
                        <p className="font-medium text-dynamic-orange">
                          {question.title}
                        </p>
                        {issues.map((issue, index) => (
                          <p
                            key={`${question.id}-${issue.originalAnswer}-${index}`}
                            className="mt-1 text-muted-foreground"
                          >
                            {t('runtime.unmatched_answer_hint', {
                              value: issue.originalAnswer,
                            })}
                          </p>
                        ))}
                      </div>
                    );
                  })
                : null}
            </div>

            {error ? (
              <div className="rounded-2xl border border-dynamic-red/25 bg-dynamic-red/10 px-4 py-3 text-dynamic-red text-sm">
                {Object.keys(validationErrorsByQuestionId).length > 0
                  ? t('runtime.validation_fix_errors')
                  : error}
              </div>
            ) : null}

            {mode === 'public' &&
            !readOnly &&
            advanceTarget.type === 'submit' ? (
              <div className="rounded-3xl border border-border/60 bg-linear-to-br from-background/90 via-background/70 to-background/45 p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-2xl',
                          toneClasses.iconClassName
                        )}
                      >
                        <Mail className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {t('runtime.response_copy_title')}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          {t('runtime.response_copy_description')}
                        </p>
                      </div>
                    </div>
                    {responseCopyEmail ? (
                      <div className="inline-flex rounded-full border border-border/60 bg-background/80 px-3 py-1.5 font-medium text-xs">
                        {t('runtime.response_copy_email_badge', {
                          email: responseCopyEmail,
                        })}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm leading-6">
                        {t('runtime.response_copy_unavailable')}
                      </p>
                    )}
                  </div>

                  <label
                    className={cn(
                      'flex min-w-60 items-start gap-3 rounded-[1.3rem] border border-border/60 bg-background/75 p-4 text-left transition-colors',
                      !responseCopyEmail && 'opacity-70'
                    )}
                  >
                    <Checkbox
                      checked={sendResponseCopy}
                      onCheckedChange={(checked) =>
                        setSendResponseCopy(checked === true)
                      }
                      disabled={!responseCopyEmail || isBusy}
                      className="mt-0.5"
                    />
                    <div className="space-y-1">
                      <p className="font-medium text-sm">
                        {t('runtime.response_copy_checkbox')}
                      </p>
                      <p className="text-muted-foreground text-xs leading-5">
                        {responseCopyEmail
                          ? t('runtime.response_copy_once_only')
                          : t('runtime.response_copy_login_required_hint')}
                      </p>
                    </div>
                  </label>
                </div>
                <p className="mt-4 text-muted-foreground text-xs leading-6">
                  {t('runtime.response_copy_support_note', {
                    email: SUPPORT_EMAIL,
                  })}
                </p>
              </div>
            ) : null}

            {shouldShowTurnstile ? (
              <div className="space-y-3 rounded-[1.4rem] border border-border/60 bg-background/60 p-4">
                <div className="space-y-1">
                  <p className="font-medium text-sm">
                    {t('runtime.turnstile_title')}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t('runtime.turnstile_description')}
                  </p>
                </div>
                {turnstileSiteKey ? (
                  <Turnstile
                    ref={captchaRef}
                    siteKey={turnstileSiteKey}
                    onSuccess={(token) => {
                      setCaptchaToken(token);
                      setCaptchaError(undefined);
                      setError(null);
                    }}
                    onExpire={() => {
                      setCaptchaToken(undefined);
                    }}
                    onError={() => {
                      setCaptchaToken(undefined);
                      setCaptchaError(t('runtime.turnstile_failed'));
                    }}
                  />
                ) : (
                  <div className="rounded-2xl border border-dynamic-orange/20 bg-dynamic-orange/10 px-4 py-3 text-dynamic-orange text-sm">
                    {t('runtime.turnstile_not_configured')}
                  </div>
                )}
                {captchaError ? (
                  <p className="text-destructive text-sm">{captchaError}</p>
                ) : null}
              </div>
            ) : null}

            {shouldShowSectionNavigation ? (
              <div className="relative z-10 flex flex-col gap-3 border-border/50 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  className={toneClasses.secondaryButtonClassName}
                  onClick={() => {
                    const previousSectionId =
                      sectionTrail[sectionTrail.length - 2];
                    if (!previousSectionId) {
                      return;
                    }

                    setSectionTrail((currentTrail) =>
                      currentTrail.slice(0, -1)
                    );
                    setCurrentSectionId(previousSectionId);
                  }}
                  disabled={sectionTrail.length <= 1 || isBusy}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t('runtime.back')}
                </Button>
                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  {advanceSectionTitle ? (
                    <div className="rounded-full border border-border/60 bg-background/60 px-3 py-1 text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
                      {t('studio.target_section')}: {advanceSectionTitle}
                    </div>
                  ) : null}
                  {!readOnly || hasReadOnlyNextSection ? (
                    <Button
                      type="button"
                      className={toneClasses.primaryButtonClassName}
                      onClick={handleAdvance}
                      disabled={isBusy || isSubmitBlockedByTurnstile}
                    >
                      {advanceTarget.type === 'submit' ? (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          {mode === 'preview'
                            ? t('runtime.finish_preview')
                            : t('runtime.submit_response')}
                        </>
                      ) : (
                        <>
                          {t('runtime.continue')}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <FormBrandFooter className="pb-2" />
        {previewImage ? (
          <FormsImageDialog
            open={!!previewImage}
            onOpenChange={(open) => {
              if (!open) {
                setPreviewImage(null);
              }
            }}
            src={previewImage.src}
            alt={previewImage.alt}
          />
        ) : null}
      </div>
    </div>
  );
}
