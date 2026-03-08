'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CircleCheckBig,
  ClipboardList,
  Clock3,
  FileText,
  Flag,
  ListChecks,
  Mail,
  MessageSquare,
  Star,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
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
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { DEV_MODE } from '@/constants/common';
import { getNextSectionTarget } from './branching';
import { normalizeMarkdownToText } from './content';
import { FORM_FONT_VARIABLES, getFormFontStyle } from './fonts';
import { QuestionTypeIcon } from './form-icons';
import { FormsMarkdown } from './forms-markdown';
import { getRuntimeProgressStats } from './runtime-progress';
import { getFormToneClasses } from './theme';
import type {
  FormAnswerValue,
  FormDefinition,
  FormDefinitionQuestion,
  FormReadOnlyAnswerIssue,
} from './types';
import { validateSubmittedAnswers } from './validation';

interface FormRuntimeProps {
  form: FormDefinition;
  mode: 'preview' | 'public';
  sessionId?: string;
  initialAnswers?: Record<string, FormAnswerValue>;
  answerIssues?: FormReadOnlyAnswerIssue[];
  submittedAt?: string | null;
  onProgress?: (payload: {
    sessionId: string;
    lastQuestionId?: string | null;
    lastSectionId?: string | null;
  }) => void;
  onSubmit?: (payload: {
    answers: Record<string, FormAnswerValue>;
    turnstileToken?: string;
  }) => Promise<void>;
  isSubmitting?: boolean;
  readOnly?: boolean;
  className?: string;
}

const densityClasses = {
  airy: {
    cardPadding: 'p-8',
    sectionGap: 'space-y-8',
    questionGap: 'space-y-6',
  },
  balanced: {
    cardPadding: 'p-6',
    sectionGap: 'space-y-6',
    questionGap: 'space-y-5',
  },
  compact: {
    cardPadding: 'p-5',
    sectionGap: 'space-y-4',
    questionGap: 'space-y-4',
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

function QuestionBlock({
  question,
  value,
  onChange,
  onProgress,
  disabled = false,
  toneClasses,
}: {
  question: FormDefinitionQuestion;
  value: FormAnswerValue | undefined;
  onChange: (value: FormAnswerValue) => void;
  onProgress: () => void;
  disabled?: boolean;
  toneClasses: ReturnType<typeof getFormToneClasses>;
}) {
  const t = useTranslations('forms');
  const settings = question.settings ?? {};

  if (question.type === 'section_break') {
    return (
      <div className="py-2">
        <Separator className="bg-border/60" />
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

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]"
          >
            <QuestionTypeIcon type={question.type} className="h-3.5 w-3.5" />
            <span>{questionTypeLabel}</span>
          </Badge>
          {question.required ? (
            <Badge variant="secondary" className="rounded-full text-[11px]">
              {t('runtime.required')}
            </Badge>
          ) : null}
        </div>
        <div className="font-semibold text-base leading-snug">
          <FormsMarkdown content={question.title} className="[&_p]:m-0" />
        </div>
        {question.description ? (
          <FormsMarkdown
            content={question.description}
            className="max-w-3xl text-muted-foreground text-sm [&_p]:leading-6"
          />
        ) : null}
      </div>

      {question.type === 'short_text' ? (
        <div className="relative">
          <FileText className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={typeof value === 'string' ? value : ''}
            placeholder={settings.placeholder || t('runtime.type_your_answer')}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onProgress}
            className={cn('pl-11', toneClasses.fieldClassName)}
            disabled={disabled}
          />
        </div>
      ) : null}

      {question.type === 'long_text' ? (
        <div className="relative">
          <MessageSquare className="absolute top-4 left-4 h-4 w-4 text-muted-foreground" />
          <Textarea
            value={typeof value === 'string' ? value : ''}
            placeholder={settings.placeholder || t('runtime.type_your_answer')}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onProgress}
            className={cn('min-h-32 pl-11', toneClasses.fieldClassName)}
            disabled={disabled}
          />
        </div>
      ) : null}

      {question.type === 'single_choice' ? (
        <RadioGroup
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onValueChange={(nextValue) => {
            onChange(nextValue);
            onProgress();
          }}
          className={choiceLayoutClassName}
        >
          {question.options.map((option) => (
            <label
              key={option.id}
              className={cn(
                'flex h-full cursor-pointer rounded-2xl border p-3.5 transition',
                value === option.value
                  ? toneClasses.selectedOptionClassName
                  : toneClasses.optionCardClassName
              )}
            >
              <div className="flex w-full items-start gap-3">
                <RadioGroupItem
                  value={option.value}
                  id={option.id}
                  className={cn('mt-1 shrink-0', toneClasses.radioClassName)}
                />
                <div className="min-w-0 flex-1 space-y-3">
                  {hasOptionImage(option) ? (
                    <div className="relative aspect-[16/10] overflow-hidden rounded-[1.15rem] border border-border/60 bg-background/70">
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
                  <div className="flex items-start gap-2">
                    <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <FormsMarkdown
                      content={option.label}
                      className="min-w-0 font-medium text-sm [&_p]:m-0 [&_p]:leading-6"
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
                  'flex h-full cursor-pointer rounded-2xl border p-3.5 transition',
                  checked
                    ? toneClasses.selectedOptionClassName
                    : toneClasses.optionCardClassName
                )}
              >
                <div className="flex w-full items-start gap-3">
                  <Checkbox
                    checked={checked}
                    className={cn(
                      'mt-1 shrink-0',
                      toneClasses.checkboxClassName
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
                      onProgress();
                    }}
                  />
                  <div className="min-w-0 flex-1 space-y-3">
                    {hasOptionImage(option) ? (
                      <div className="relative aspect-[16/10] overflow-hidden rounded-[1.15rem] border border-border/60 bg-background/70">
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
                    <div className="flex items-start gap-2">
                      <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <FormsMarkdown
                        content={option.label}
                        className="min-w-0 font-medium text-sm [&_p]:m-0 [&_p]:leading-6"
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
            onProgress();
          }}
        >
          <SelectTrigger className={toneClasses.fieldClassName}>
            {typeof value === 'string' && value ? (
              <div className="flex min-w-0 items-center gap-2">
                <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
                <FormsMarkdown
                  content={
                    question.options.find((option) => option.value === value)
                      ?.label ?? value
                  }
                  variant="inline"
                  className="min-w-0 truncate text-left text-sm"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <ClipboardList className="h-4 w-4" />
                <span>{t('runtime.choose_option')}</span>
              </div>
            )}
          </SelectTrigger>
          <SelectContent>
            {question.options.map((option) => (
              <SelectItem key={option.id} value={option.value}>
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
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
        <div className="space-y-4 rounded-[1.6rem] border border-border/60 bg-background/45 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-background/70 text-muted-foreground shadow-sm">
                <QuestionTypeIcon type={question.type} className="h-4 w-4" />
              </span>
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
                  {question.type === 'rating'
                    ? t('question_type.rating')
                    : t('question_type.linear_scale')}
                </p>
                <p className="text-muted-foreground text-sm">
                  {scaleMin} - {scaleMax}
                </p>
              </div>
            </div>
            <div className="rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-sm shadow-sm">
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
                <span className="text-muted-foreground">
                  {t('runtime.choose_option')}
                </span>
              )}
            </div>
          </div>

          {question.type === 'linear_scale' ? (
            <div className="rounded-[1.45rem] border border-border/60 bg-background/55 p-4 shadow-sm">
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
                  onProgress();
                }}
                className={cn(
                  'px-1 py-4 **:data-[slot=slider-thumb]:h-5 **:data-[slot=slider-thumb]:w-5 **:data-[slot=slider-thumb]:border-2 **:data-[slot=slider-thumb]:border-current **:data-[slot=slider-range]:bg-current **:data-[slot=slider-thumb]:bg-background',
                  selectedScaleLabel
                    ? 'text-foreground'
                    : 'text-muted-foreground'
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
                          onProgress();
                          return;
                        }
                        onChange(option.value);
                        onProgress();
                      }}
                      className={cn(
                        'rounded-[1.15rem] border px-3 py-3 text-left transition focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        active
                          ? cn(
                              toneClasses.selectedOptionClassName,
                              'shadow-sm ring-1 ring-current/20'
                            )
                          : cn(
                              toneClasses.optionCardClassName,
                              'hover:border-foreground/20 hover:bg-background/80'
                            )
                      )}
                      aria-label={showLabel ? plainOptionLabel : option.value}
                      aria-pressed={active}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-base">
                          {option.value}
                        </span>
                        {active ? <Check className="h-4 w-4" /> : null}
                      </div>
                      {showLabel ? (
                        <FormsMarkdown
                          content={option.label}
                          className="mt-1.5 line-clamp-2 text-muted-foreground text-xs leading-4 [&_p]:m-0"
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
            <div className="rounded-[1.45rem] border border-border/60 bg-background/55 p-5 shadow-sm">
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
                          onProgress();
                          return;
                        }
                        onChange(option.value);
                        onProgress();
                      }}
                      className={cn(
                        'group flex h-14 w-14 items-center justify-center rounded-[1.15rem] border transition hover:border-foreground/20 focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        selected
                          ? cn(
                              toneClasses.selectedOptionClassName,
                              'shadow-sm ring-1 ring-current/20'
                            )
                          : cn(
                              toneClasses.optionCardClassName,
                              'hover:bg-background/80'
                            )
                      )}
                      aria-label={normalizeMarkdownToText(option.label)}
                      aria-pressed={selected}
                    >
                      <Star
                        className={cn(
                          'h-7 w-7 transition',
                          active ? 'fill-current' : 'fill-transparent'
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
                  className="mt-3 text-center text-muted-foreground text-sm [&_p]:m-0"
                />
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {question.type === 'date' ? (
        <div className="space-y-3 rounded-[1.45rem] border border-border/60 bg-background/55 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Calendar className="h-4 w-4" />
            <span>{t('question_type.date')}</span>
          </div>
          <DateTimePicker
            date={parseDateAnswer(value)}
            setDate={(date) => {
              onChange(formatDateAnswer(date));
              onProgress();
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
            onProgress();
          }}
        >
          <SelectTrigger className={toneClasses.fieldClassName}>
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder={t('runtime.pick_time')} />
            </div>
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
    </div>
  );
}

export function FormRuntime({
  form,
  mode,
  sessionId,
  initialAnswers,
  answerIssues = [],
  submittedAt,
  onProgress,
  onSubmit,
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
  const [submitted, setSubmitted] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [captchaError, setCaptchaError] = useState<string>();
  const [, startTransition] = useTransition();
  const captchaRef = useRef<TurnstileInstance>(null);

  const toneClasses = getFormToneClasses(form.theme.accentColor);
  const bodyFontStyle = getFormFontStyle(form.theme.bodyFontId);
  const headlineFontStyle = getFormFontStyle(form.theme.headlineFontId);
  const density = densityClasses[form.theme.density];
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? undefined;
  const requiresTurnstile = mode === 'public' && !readOnly && !DEV_MODE;
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
          .filter((question) => question.required)
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

  useEffect(() => {
    const nextAnswers = initialAnswers ?? {};
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
  }, [initialAnswers]);

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
  };

  const emitProgress = (payload: { lastQuestionId?: string | null }) => {
    if (!sessionId || !onProgress) {
      return;
    }

    startTransition(() => {
      onProgress({
        sessionId,
        lastSectionId: currentSection?.id ?? null,
        ...payload,
      });
    });
  };

  const validateCurrentSection = (
    currentAnswers: Record<string, FormAnswerValue>
  ) => {
    const firstMissingRequired = currentSection?.questions.find((question) => {
      if (!requiredQuestionIds.has(question.id)) {
        return false;
      }

      const value = currentAnswers[question.id];
      if (Array.isArray(value)) {
        return value.length === 0;
      }

      return value == null || value === '';
    });

    if (firstMissingRequired) {
      setError(
        t('runtime.required_before_continue', {
          title: normalizeMarkdownToText(firstMissingRequired.title),
        })
      );
      return false;
    }

    return true;
  };

  const handleAdvance = async () => {
    const currentAnswers = answersRef.current;

    if (!readOnly && !validateCurrentSection(currentAnswers)) {
      return;
    }

    const target = readOnly
      ? advanceTarget
      : getNextSectionTarget(form, currentSection.id, currentAnswers);

    emitProgress({
      lastQuestionId: currentSection.questions.at(-1)?.id ?? null,
    });

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
        setError(
          t('runtime.missing_required_answers', {
            items: validation.missingRequired.join(', '),
          })
        );
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

      await onSubmit({
        answers: currentAnswers,
        turnstileToken: captchaToken,
      });
      captchaRef.current?.reset();
      setCaptchaToken(undefined);
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
        <Card
          className={cn(
            'mx-auto w-full max-w-3xl border-0',
            toneClasses.cardClassName
          )}
        >
          <CardContent className="space-y-4 p-8 text-center">
            <div
              className={cn(
                'mx-auto flex h-16 w-16 items-center justify-center rounded-full',
                toneClasses.iconClassName
              )}
            >
              <CircleCheckBig className="h-8 w-8" />
            </div>
            <h2 className="font-semibold text-3xl" style={headlineFontStyle}>
              {form.settings.confirmationTitle}
            </h2>
            <p className="mx-auto max-w-xl text-muted-foreground">
              {form.settings.confirmationMessage}
            </p>
          </CardContent>
        </Card>
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
            <div className="relative aspect-16/6 w-full overflow-hidden">
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
              <div className="absolute inset-x-0 bottom-0 p-6 lg:p-8">
                <div className="space-y-3">
                  {form.theme.coverKicker ? (
                    <p className="font-medium text-[11px] text-white/75 uppercase tracking-[0.3em]">
                      {form.theme.coverKicker}
                    </p>
                  ) : null}
                  <div
                    className="max-w-4xl font-semibold text-4xl text-white leading-tight sm:text-5xl"
                    style={headlineFontStyle}
                  >
                    <FormsMarkdown
                      content={form.theme.coverHeadline || form.title}
                      className="[&_a]:text-white [&_p]:m-0 [&_p]:leading-tight"
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
                  {form.theme.coverKicker ? (
                    <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.3em]">
                      {form.theme.coverKicker}
                    </p>
                  ) : null}
                  <div
                    className="max-w-3xl font-semibold text-4xl leading-tight sm:text-5xl"
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
              <div className="max-w-3xl rounded-[1.65rem] border border-border/60 bg-background/45 p-5 sm:p-6">
                <FormsMarkdown
                  content={form.description}
                  className="text-base text-muted-foreground"
                />
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
          className={cn('mx-auto w-full border-0', toneClasses.cardClassName)}
        >
          <CardHeader className={density.cardPadding}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="font-semibold text-2xl">
                  <FormsMarkdown
                    content={visibleSectionTitle}
                    className="[&_p]:m-0 [&_p]:leading-tight"
                  />
                </div>
              </div>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                <Flag className="mr-1 h-3.5 w-3.5" />
                {currentSectionIndex + 1} / {form.sections.length}
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
              </div>
            ) : null}
          </CardHeader>
          <CardContent className={cn(density.cardPadding, density.sectionGap)}>
            {currentSection.description ? (
              <div className="max-w-3xl rounded-[1.45rem] border border-border/60 bg-background/45 p-4 sm:p-5">
                <FormsMarkdown
                  content={currentSection.description}
                  className="text-muted-foreground text-sm"
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
                  onProgress={() =>
                    mode === 'public' && !readOnly
                      ? emitProgress({ lastQuestionId: question.id })
                      : undefined
                  }
                  disabled={isSubmitting || readOnly}
                  toneClasses={toneClasses}
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
              <div className="rounded-2xl border border-dynamic-red/20 bg-dynamic-red/10 px-4 py-3 text-dynamic-red text-sm">
                {error}
              </div>
            ) : null}

            {requiresTurnstile ? (
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

            <div className="flex flex-col gap-3 border-border/50 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
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

                  setSectionTrail((currentTrail) => currentTrail.slice(0, -1));
                  setCurrentSectionId(previousSectionId);
                }}
                disabled={sectionTrail.length <= 1 || isSubmitting}
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
                <Button
                  type="button"
                  className={toneClasses.primaryButtonClassName}
                  onClick={handleAdvance}
                  disabled={
                    isSubmitting ||
                    (readOnly &&
                      currentSectionIndex >= form.sections.length - 1)
                  }
                >
                  {readOnly ? (
                    <>
                      {t('runtime.continue')}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  ) : advanceTarget.type === 'submit' ? (
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
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
