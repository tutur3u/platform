'use client';

import { Trash } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';

import type { FormLogicRuleInput } from '../schema';
import type { getFormToneClasses } from '../theme';
import { renderLogicRuleQuestionTrigger } from './logic-rule-question-trigger';
import { renderLogicRuleSectionTrigger } from './logic-rule-section-trigger';
import {
  getOperatorOptions,
  type LogicAnswerableQuestion,
  type LogicChoice,
  normalizeComparisonValue,
} from './logic-rules-utils';
import type { FormsTranslator } from './studio-translator';
import type { StudioForm, StudioSectionInput } from './studio-utils';

export function renderLogicRuleRow({
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
}: {
  index: number;
  t: FormsTranslator;
  form: StudioForm;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  rulesArray: {
    fields: Array<{ id: string }>;
    remove: (index: number) => void;
  };
  logicRules: FormLogicRuleInput[];
  answerableQuestions: LogicAnswerableQuestion[];
  sections: StudioSectionInput[];
  questionChoices: LogicChoice[];
  sectionChoices: LogicChoice[];
  getComparisonChoices: (questionId: string) => LogicChoice[];
}) {
  const field = rulesArray.fields[index];
  const rule = logicRules[index];
  const triggerType = rule?.triggerType ?? 'question';
  const sourceQuestion = answerableQuestions.find(
    (item) => item.id === (rule?.sourceQuestionId ?? '').trim()
  );
  const sectionEndQuestions =
    triggerType === 'section_end'
      ? answerableQuestions.filter(
          (aq) => aq.sectionId === (rule?.sourceSectionId ?? '').trim()
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
    triggerType === 'section_end' && !(rule?.sourceQuestionId ?? '').trim();

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
              const nextTrigger = value as FormLogicRuleInput['triggerType'];
              form.setValue(`logicRules.${index}.triggerType`, nextTrigger, {
                shouldDirty: true,
              });
              if (nextTrigger === 'section_end') {
                form.setValue(
                  `logicRules.${index}.sourceSectionId`,
                  sections[0]?.id ?? null,
                  { shouldDirty: true }
                );
                form.setValue(`logicRules.${index}.sourceQuestionId`, null, {
                  shouldDirty: true,
                });
                form.setValue(`logicRules.${index}.comparisonValue`, '', {
                  shouldDirty: true,
                });
              } else {
                form.setValue(`logicRules.${index}.sourceSectionId`, null, {
                  shouldDirty: true,
                });
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

        {triggerType === 'question'
          ? renderLogicRuleQuestionTrigger({
              t,
              form,
              index,
              rule,
              toneClasses,
              sections,
              answerableQuestions,
              questionChoices,
              getComparisonChoices,
              operatorOptions,
              sourceQuestion,
              comparisonChoices,
              comparisonValue,
            })
          : renderLogicRuleSectionTrigger({
              t,
              form,
              index,
              rule,
              toneClasses,
              sectionChoices,
              answerableQuestions,
              sectionEndQuestions,
              getComparisonChoices,
              operatorOptions,
              sourceQuestion,
              comparisonChoices,
              comparisonValue,
              isCompletionOnly,
            })}

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
              <SelectItem value="submit">{t('logic_action.submit')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {rule?.actionType === 'go_to_section' ? (
          <div className="space-y-1.5">
            <Label>{t('studio.target_section')}</Label>
            <Select
              value={rule.targetSectionId ?? ''}
              onValueChange={(value) =>
                form.setValue(`logicRules.${index}.targetSectionId`, value, {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger className={toneClasses.fieldClassName}>
                <SelectValue placeholder={t('studio.target_section')} />
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
}
