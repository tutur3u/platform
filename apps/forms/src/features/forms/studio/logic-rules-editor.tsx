'use client';

import { ChevronDown, Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { useFieldArray, useWatch } from '@tuturuuu/ui/hooks/use-form';
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
import { normalizeMarkdownToText } from '../content';
import type { getFormToneClasses } from '../theme';
import { renderLogicRuleRow } from './logic-rule-row';
import {
  getOperatorOptions,
  normalizeComparisonValue,
  TIME_OPTIONS,
} from './logic-rules-utils';
import { createClientId, type StudioForm } from './studio-utils';

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
        <CardHeader className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-auto min-w-0 flex-1 justify-start px-0 hover:bg-transparent"
            >
              <div className="flex min-w-0 flex-1 flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-left">
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
                    'h-4 w-4 shrink-0 transition-transform',
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
            className={cn(
              'w-full sm:w-auto',
              toneClasses.secondaryButtonClassName
            )}
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

            {filteredRulesIndices.map((index) =>
              renderLogicRuleRow({
                index,
                t,
                form,
                toneClasses,
                rulesArray,
                logicRules,
                answerableQuestions,
                sections,
                questionChoices,
                sectionChoices,
                getComparisonChoices,
              })
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
