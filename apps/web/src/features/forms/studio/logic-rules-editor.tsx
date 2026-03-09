'use client';

import { ChevronDown, Plus, Trash } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
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
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { isAnswerableQuestionType } from '../block-utils';
import {
  normalizeMarkdownForComparison,
  normalizeMarkdownToText,
} from '../content';
import type { FormLogicRuleInput, FormQuestionInput } from '../schema';
import type { getFormToneClasses } from '../theme';
import { createClientId, type StudioForm } from './studio-utils';

const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4)
    .toString()
    .padStart(2, '0');
  const minute = ['00', '15', '30', '45'][index % 4] ?? '00';

  return `${hour}:${minute}`;
});

function parseDateValue(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function formatDateValue(date: Date | undefined) {
  if (!date) {
    return '';
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getOperatorOptions(questionType?: FormQuestionInput['type']) {
  if (questionType === 'short_text' || questionType === 'long_text') {
    return ['equals', 'not_equals', 'contains'] as const;
  }

  if (questionType === 'multiple_choice') {
    return ['contains', 'equals', 'not_equals'] as const;
  }

  return ['equals', 'not_equals'] as const;
}

function normalizeComparisonValue(
  question:
    | {
        type: FormQuestionInput['type'];
        options: Array<{ label: string; value: string }>;
      }
    | undefined,
  comparisonValue: string | undefined
) {
  if (!question || !comparisonValue?.trim()) {
    return comparisonValue ?? '';
  }

  if (
    question.type !== 'single_choice' &&
    question.type !== 'multiple_choice' &&
    question.type !== 'dropdown'
  ) {
    return comparisonValue;
  }

  const normalizedComparisonValue =
    normalizeMarkdownForComparison(comparisonValue);
  const matchedOption = question.options.find(
    (option) =>
      option.value.trim().toLowerCase() === normalizedComparisonValue ||
      normalizeMarkdownForComparison(option.label) === normalizedComparisonValue
  );

  return matchedOption?.value ?? comparisonValue;
}

export function LogicRulesEditor({
  form,
  toneClasses,
}: {
  form: StudioForm;
  toneClasses: ReturnType<typeof getFormToneClasses>;
}) {
  const t = useTranslations('forms');
  const [open, setOpen] = useState(false);
  const rulesArray = useFieldArray({
    control: form.control,
    name: 'logicRules',
  });
  const sections = useWatch({ control: form.control, name: 'sections' }) ?? [];
  const logicRules =
    useWatch({ control: form.control, name: 'logicRules' }) ?? [];

  const answerableQuestions = useMemo(
    () =>
      sections.flatMap((section, sectionIndex) =>
        section.questions
          .filter((question) => isAnswerableQuestionType(question.type))
          .map((question, questionIndex) => ({
            id:
              question.id || `draft-question-${sectionIndex}-${questionIndex}`,
            sectionId: section.id || `draft-section-${sectionIndex}`,
            sectionIndex,
            questionIndex,
            title: question.title,
            type: question.type,
            settings: question.settings,
            options: question.options,
            label: `${normalizeMarkdownToText(section.title) || t('studio.untitled_section')} / ${normalizeMarkdownToText(question.title)}`,
          }))
      ),
    [sections, t]
  );

  const questionChoices = answerableQuestions.map((q) => ({
    value: q.id,
    label: q.label,
  }));

  const sectionChoices = sections.map((section, index) => ({
    value: (section.id ?? '').trim() || `_s_${index}`,
    label:
      normalizeMarkdownToText(section.title) || t('studio.untitled_section'),
  }));

  const [filterSectionId, setFilterSectionId] = useState<string>('all');
  const [filterQuestionId, setFilterQuestionId] = useState<string>('all');

  const filteredRulesIndices = useMemo(() => {
    return logicRules
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => {
        if (filterSectionId && filterSectionId !== 'all') {
          const triggerType = rule?.triggerType ?? 'question';
          if (triggerType === 'section_end') {
            if ((rule?.sourceSectionId ?? '').trim() !== filterSectionId) {
              return false;
            }
          } else {
            const q = answerableQuestions.find(
              (aq) => aq.id === (rule?.sourceQuestionId ?? '').trim()
            );
            if (q?.sectionId !== filterSectionId) return false;
          }
        }
        if (filterQuestionId && filterQuestionId !== 'all') {
          if ((rule?.sourceQuestionId ?? '').trim() !== filterQuestionId) {
            return false;
          }
        }
        return true;
      })
      .map(({ index }) => index);
  }, [logicRules, filterSectionId, filterQuestionId, answerableQuestions]);

  useEffect(() => {
    logicRules.forEach((rule, index) => {
      const sourceQuestionId = (rule?.sourceQuestionId ?? '').trim();
      if (!sourceQuestionId) return;

      const sourceQuestion = answerableQuestions.find(
        (item) => item.id === sourceQuestionId
      );
      const normalizedValue = normalizeComparisonValue(
        sourceQuestion,
        rule?.comparisonValue
      );

      if (normalizedValue !== (rule?.comparisonValue ?? '')) {
        form.setValue(`logicRules.${index}.comparisonValue`, normalizedValue, {
          shouldDirty: true,
        });
      }
    });
  }, [answerableQuestions, form, logicRules]);

  const getComparisonChoices = (questionId: string) => {
    const question = answerableQuestions.find((item) => item.id === questionId);

    if (!question) {
      return [];
    }

    if (
      question.type === 'single_choice' ||
      question.type === 'multiple_choice' ||
      question.type === 'dropdown'
    ) {
      return question.options.map((option, index) => ({
        value: option.value || `draft-option-${index}`,
        label: normalizeMarkdownToText(option.label) || `Option ${index + 1}`,
      }));
    }

    if (question.type === 'linear_scale' || question.type === 'rating') {
      const min = question.settings.scaleMin ?? 1;
      const max =
        question.type === 'rating'
          ? (question.settings.ratingMax ?? 5)
          : (question.settings.scaleMax ?? 5);

      return Array.from({ length: max - min + 1 }, (_, index) => {
        const value = String(min + index);
        return { value, label: value };
      });
    }

    if (question.type === 'time') {
      return TIME_OPTIONS.map((time) => ({
        value: time,
        label: time,
      }));
    }

    return [];
  };

  const appendRule = () => {
    const firstSection = sections[0];
    const firstQuestion = answerableQuestions[0];

    if (!firstSection) {
      toast.error(t('toast.logic_rule_question_required'));
      return;
    }

    const nextSectionId =
      sections.find((section) => section.id && section.id !== firstSection?.id)
        ?.id ??
      firstSection?.id ??
      null;

    setOpen(true);
    rulesArray.append({
      id: createClientId(),
      triggerType: 'question',
      sourceSectionId: null,
      sourceQuestionId: firstQuestion?.id ?? '',
      operator: getOperatorOptions(firstQuestion?.type)[0] ?? 'equals',
      comparisonValue: firstQuestion
        ? (getComparisonChoices(firstQuestion.id)[0]?.value ?? '')
        : '',
      actionType: 'go_to_section',
      targetSectionId: nextSectionId,
    });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden border-border/60 bg-card/80 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-auto flex-1 justify-start px-0 hover:bg-transparent"
            >
              <div className="flex flex-1 items-center justify-between gap-3">
                <div className="text-left">
                  <CardTitle className="text-base">
                    {t('studio.branching_rules')}
                  </CardTitle>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {rulesArray.fields.length === 0
                      ? t('studio.branching_description')
                      : t('studio.rule_count', {
                          count: rulesArray.fields.length,
                        })}
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform',
                    open && 'rotate-180'
                  )}
                />
              </div>
            </Button>
          </CollapsibleTrigger>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={toneClasses.secondaryButtonClassName}
            onClick={appendRule}
            disabled={answerableQuestions.length === 0}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('studio.add_rule')}
          </Button>
        </CardHeader>
        <CollapsibleContent className="overflow-hidden border-border/60 border-t data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div className="space-y-4 px-6 py-4">
            {rulesArray.fields.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t('studio.branching_description')}
              </p>
            ) : null}

            {rulesArray.fields.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <Select
                  value={filterSectionId}
                  onValueChange={setFilterSectionId}
                >
                  <SelectTrigger className="h-8 w-45">
                    <SelectValue placeholder={t('studio.filter_by_section')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t('studio.filter_by_section')}
                    </SelectItem>
                    {sectionChoices.map((choice) => (
                      <SelectItem key={choice.value} value={choice.value}>
                        {choice.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={filterQuestionId}
                  onValueChange={setFilterQuestionId}
                >
                  <SelectTrigger className="h-8 w-45">
                    <SelectValue placeholder={t('studio.filter_by_question')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t('studio.filter_by_question')}
                    </SelectItem>
                    {questionChoices.map((choice) => (
                      <SelectItem key={choice.value} value={choice.value}>
                        {choice.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {filteredRulesIndices.map((index) => {
              const field = rulesArray.fields[index];
              const rule = logicRules[index];
              const triggerType = rule?.triggerType ?? 'question';
              const sourceQuestion = answerableQuestions.find(
                (item) => item.id === (rule?.sourceQuestionId ?? '').trim()
              );
              const sectionEndQuestions =
                triggerType === 'section_end'
                  ? answerableQuestions.filter(
                      (aq) =>
                        aq.sectionId === (rule?.sourceSectionId ?? '').trim()
                    )
                  : [];
              const comparisonChoices = sourceQuestion
                ? getComparisonChoices(sourceQuestion.id)
                : [];
              const comparisonValue = normalizeComparisonValue(
                sourceQuestion,
                rule?.comparisonValue
              );
              const operatorOptions = getOperatorOptions(sourceQuestion?.type);
              const isCompletionOnly =
                triggerType === 'section_end' &&
                !(rule?.sourceQuestionId ?? '').trim();

              return (
                <div
                  key={field?.id ?? index}
                  className="space-y-4 rounded-[1.35rem] border border-border/60 bg-background/50 p-4"
                >
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_180px_180px_180px_auto]">
                    <div className="space-y-1.5">
                      <Label>{t('studio.trigger_type')}</Label>
                      <Select
                        value={triggerType}
                        onValueChange={(value) => {
                          const nextTrigger =
                            value as FormLogicRuleInput['triggerType'];
                          form.setValue(
                            `logicRules.${index}.triggerType`,
                            nextTrigger,
                            { shouldDirty: true }
                          );
                          if (nextTrigger === 'section_end') {
                            form.setValue(
                              `logicRules.${index}.sourceSectionId`,
                              sections[0]?.id ?? null,
                              { shouldDirty: true }
                            );
                            form.setValue(
                              `logicRules.${index}.sourceQuestionId`,
                              null,
                              { shouldDirty: true }
                            );
                            form.setValue(
                              `logicRules.${index}.comparisonValue`,
                              '',
                              { shouldDirty: true }
                            );
                          } else {
                            form.setValue(
                              `logicRules.${index}.sourceSectionId`,
                              null,
                              { shouldDirty: true }
                            );
                            form.setValue(
                              `logicRules.${index}.sourceQuestionId`,
                              answerableQuestions[0]?.id ?? '',
                              { shouldDirty: true }
                            );
                            const q = answerableQuestions[0];
                            const choices = q ? getComparisonChoices(q.id) : [];
                            form.setValue(
                              `logicRules.${index}.comparisonValue`,
                              choices[0]?.value ?? '',
                              { shouldDirty: true }
                            );
                          }
                        }}
                      >
                        <SelectTrigger className={toneClasses.fieldClassName}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="question">
                            {t('logic_trigger.question')}
                          </SelectItem>
                          <SelectItem value="section_end">
                            {t('logic_trigger.section_end')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {triggerType === 'question' ? (
                      <>
                        <div className="space-y-1.5">
                          <Label>{t('studio.question')}</Label>
                          <Select
                            value={(rule?.sourceQuestionId ?? '').trim() || ''}
                            onValueChange={(value) => {
                              const nextQuestion = answerableQuestions.find(
                                (item) => item.id === value
                              );
                              const nextComparisonChoices = nextQuestion
                                ? getComparisonChoices(nextQuestion.id)
                                : [];
                              const nextOperator =
                                getOperatorOptions(nextQuestion?.type)[0] ??
                                'equals';
                              const nextTargetSectionId =
                                sections.find(
                                  (section) =>
                                    section.id &&
                                    section.id !== nextQuestion?.sectionId
                                )?.id ??
                                sections[0]?.id ??
                                null;

                              form.setValue(
                                `logicRules.${index}.sourceQuestionId`,
                                value,
                                { shouldDirty: true }
                              );
                              form.setValue(
                                `logicRules.${index}.operator`,
                                nextOperator as FormLogicRuleInput['operator'],
                                { shouldDirty: true }
                              );
                              form.setValue(
                                `logicRules.${index}.comparisonValue`,
                                nextComparisonChoices[0]?.value ?? '',
                                { shouldDirty: true }
                              );
                              if (
                                form.getValues(
                                  `logicRules.${index}.actionType`
                                ) === 'go_to_section'
                              ) {
                                form.setValue(
                                  `logicRules.${index}.targetSectionId`,
                                  nextTargetSectionId,
                                  { shouldDirty: true }
                                );
                              }
                            }}
                          >
                            <SelectTrigger
                              className={toneClasses.fieldClassName}
                            >
                              <SelectValue placeholder={t('studio.question')} />
                            </SelectTrigger>
                            <SelectContent>
                              {questionChoices.map((choice) => (
                                <SelectItem
                                  key={choice.value}
                                  value={choice.value}
                                >
                                  {choice.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label>{t('studio.match_operator')}</Label>
                          <Select
                            value={rule?.operator ?? operatorOptions[0]}
                            onValueChange={(value) =>
                              form.setValue(
                                `logicRules.${index}.operator`,
                                value as FormLogicRuleInput['operator'],
                                { shouldDirty: true }
                              )
                            }
                          >
                            <SelectTrigger
                              className={toneClasses.fieldClassName}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {operatorOptions.map((operator) => (
                                <SelectItem key={operator} value={operator}>
                                  {t(`logic_operator.${operator}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label>{t('studio.comparison_value')}</Label>
                          {sourceQuestion?.type === 'date' ? (
                            <DateTimePicker
                              date={parseDateValue(rule?.comparisonValue)}
                              setDate={(date) =>
                                form.setValue(
                                  `logicRules.${index}.comparisonValue`,
                                  formatDateValue(date),
                                  { shouldDirty: true }
                                )
                              }
                              showTimeSelect={false}
                            />
                          ) : comparisonChoices.length > 0 ? (
                            <Select
                              value={comparisonValue}
                              onValueChange={(value) =>
                                form.setValue(
                                  `logicRules.${index}.comparisonValue`,
                                  value,
                                  { shouldDirty: true }
                                )
                              }
                            >
                              <SelectTrigger
                                className={toneClasses.fieldClassName}
                              >
                                <SelectValue
                                  placeholder={t('studio.comparison_value')}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {comparisonChoices.map((choice) => (
                                  <SelectItem
                                    key={choice.value}
                                    value={choice.value}
                                  >
                                    {choice.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={rule?.comparisonValue ?? ''}
                              className={toneClasses.fieldClassName}
                              placeholder={t('studio.comparison_value')}
                              onChange={(event) =>
                                form.setValue(
                                  `logicRules.${index}.comparisonValue`,
                                  event.target.value,
                                  { shouldDirty: true }
                                )
                              }
                            />
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          <Label>{t('studio.source_section')}</Label>
                          <Select
                            value={(rule?.sourceSectionId ?? '').trim() || ''}
                            onValueChange={(value) => {
                              form.setValue(
                                `logicRules.${index}.sourceSectionId`,
                                value,
                                { shouldDirty: true }
                              );
                              form.setValue(
                                `logicRules.${index}.sourceQuestionId`,
                                null,
                                { shouldDirty: true }
                              );
                              form.setValue(
                                `logicRules.${index}.comparisonValue`,
                                '',
                                { shouldDirty: true }
                              );
                            }}
                          >
                            <SelectTrigger
                              className={toneClasses.fieldClassName}
                            >
                              <SelectValue
                                placeholder={t('studio.source_section')}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {sectionChoices.map((choice) => (
                                <SelectItem
                                  key={choice.value}
                                  value={choice.value}
                                >
                                  {choice.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label>{t('studio.question')}</Label>
                          <Select
                            value={
                              isCompletionOnly
                                ? '__completion_only__'
                                : (rule?.sourceQuestionId ?? '').trim() || ''
                            }
                            onValueChange={(value) => {
                              if (value === '__completion_only__') {
                                form.setValue(
                                  `logicRules.${index}.sourceQuestionId`,
                                  null,
                                  { shouldDirty: true }
                                );
                                form.setValue(
                                  `logicRules.${index}.comparisonValue`,
                                  '',
                                  { shouldDirty: true }
                                );
                              } else {
                                const nextQuestion = answerableQuestions.find(
                                  (item) => item.id === value
                                );
                                const nextChoices = nextQuestion
                                  ? getComparisonChoices(nextQuestion.id)
                                  : [];
                                form.setValue(
                                  `logicRules.${index}.sourceQuestionId`,
                                  value,
                                  { shouldDirty: true }
                                );
                                form.setValue(
                                  `logicRules.${index}.comparisonValue`,
                                  nextChoices[0]?.value ?? '',
                                  { shouldDirty: true }
                                );
                              }
                            }}
                          >
                            <SelectTrigger
                              className={toneClasses.fieldClassName}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__completion_only__">
                                {t('studio.completion_only')}
                              </SelectItem>
                              {sectionEndQuestions.map((q) => (
                                <SelectItem key={q.id} value={q.id}>
                                  {normalizeMarkdownToText(q.title)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {!isCompletionOnly ? (
                          <>
                            <div className="space-y-1.5">
                              <Label>{t('studio.match_operator')}</Label>
                              <Select
                                value={rule?.operator ?? operatorOptions[0]}
                                onValueChange={(value) =>
                                  form.setValue(
                                    `logicRules.${index}.operator`,
                                    value as FormLogicRuleInput['operator'],
                                    { shouldDirty: true }
                                  )
                                }
                              >
                                <SelectTrigger
                                  className={toneClasses.fieldClassName}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {operatorOptions.map((operator) => (
                                    <SelectItem key={operator} value={operator}>
                                      {t(`logic_operator.${operator}`)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-1.5">
                              <Label>{t('studio.comparison_value')}</Label>
                              {sourceQuestion?.type === 'date' ? (
                                <DateTimePicker
                                  date={parseDateValue(rule?.comparisonValue)}
                                  setDate={(date) =>
                                    form.setValue(
                                      `logicRules.${index}.comparisonValue`,
                                      formatDateValue(date),
                                      { shouldDirty: true }
                                    )
                                  }
                                  showTimeSelect={false}
                                />
                              ) : comparisonChoices.length > 0 ? (
                                <Select
                                  value={comparisonValue}
                                  onValueChange={(value) =>
                                    form.setValue(
                                      `logicRules.${index}.comparisonValue`,
                                      value,
                                      { shouldDirty: true }
                                    )
                                  }
                                >
                                  <SelectTrigger
                                    className={toneClasses.fieldClassName}
                                  >
                                    <SelectValue
                                      placeholder={t('studio.comparison_value')}
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {comparisonChoices.map((choice) => (
                                      <SelectItem
                                        key={choice.value}
                                        value={choice.value}
                                      >
                                        {choice.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  value={rule?.comparisonValue ?? ''}
                                  className={toneClasses.fieldClassName}
                                  placeholder={t('studio.comparison_value')}
                                  onChange={(event) =>
                                    form.setValue(
                                      `logicRules.${index}.comparisonValue`,
                                      event.target.value,
                                      { shouldDirty: true }
                                    )
                                  }
                                />
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="col-span-2" />
                        )}
                      </>
                    )}

                    <div className="flex items-end">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="rounded-xl"
                        onClick={() => rulesArray.remove(index)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
                    <div className="space-y-1.5">
                      <Label>{t('studio.rule_action')}</Label>
                      <Select
                        value={rule?.actionType ?? 'go_to_section'}
                        onValueChange={(value) =>
                          form.setValue(
                            `logicRules.${index}.actionType`,
                            value as FormLogicRuleInput['actionType'],
                            { shouldDirty: true }
                          )
                        }
                      >
                        <SelectTrigger className={toneClasses.fieldClassName}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="go_to_section">
                            {t('logic_action.go_to_section')}
                          </SelectItem>
                          <SelectItem value="submit">
                            {t('logic_action.submit')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {rule?.actionType === 'go_to_section' ? (
                      <div className="space-y-1.5">
                        <Label>{t('studio.target_section')}</Label>
                        <Select
                          value={rule.targetSectionId ?? ''}
                          onValueChange={(value) =>
                            form.setValue(
                              `logicRules.${index}.targetSectionId`,
                              value,
                              { shouldDirty: true }
                            )
                          }
                        >
                          <SelectTrigger className={toneClasses.fieldClassName}>
                            <SelectValue
                              placeholder={t('studio.target_section')}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {sections.map((section, idx) => (
                              <SelectItem
                                key={section.id ?? idx}
                                value={section.id ?? `section:${idx}`}
                              >
                                {section.title || t('studio.untitled_section')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="flex items-center rounded-2xl border border-border/60 bg-background/60 px-4 text-muted-foreground text-sm">
                        {t('studio.branching_description')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
