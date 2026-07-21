'use client';

import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';

import { normalizeMarkdownToText } from '../content';
import type { FormLogicRuleInput } from '../schema';
import type { getFormToneClasses } from '../theme';
import {
  formatDateValue,
  type getOperatorOptions,
  type LogicAnswerableQuestion,
  type LogicChoice,
  parseDateValue,
} from './logic-rules-utils';
import type { FormsTranslator } from './studio-translator';
import type { StudioForm } from './studio-utils';

export function renderLogicRuleSectionTrigger({
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
}: {
  t: FormsTranslator;
  form: StudioForm;
  index: number;
  rule: FormLogicRuleInput | undefined;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  sectionChoices: LogicChoice[];
  answerableQuestions: LogicAnswerableQuestion[];
  sectionEndQuestions: LogicAnswerableQuestion[];
  getComparisonChoices: (questionId: string) => LogicChoice[];
  operatorOptions: ReturnType<typeof getOperatorOptions>;
  sourceQuestion: LogicAnswerableQuestion | undefined;
  comparisonChoices: LogicChoice[];
  comparisonValue: string;
  isCompletionOnly: boolean;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label>{t('studio.source_section')}</Label>
        <Select
          value={(rule?.sourceSectionId ?? '').trim() || ''}
          onValueChange={(value) => {
            form.setValue(`logicRules.${index}.sourceSectionId`, value, {
              shouldDirty: true,
            });
            form.setValue(`logicRules.${index}.sourceQuestionId`, null, {
              shouldDirty: true,
            });
            form.setValue(`logicRules.${index}.comparisonValue`, '', {
              shouldDirty: true,
            });
          }}
        >
          <SelectTrigger className={toneClasses.fieldClassName}>
            <SelectValue placeholder={t('studio.source_section')} />
          </SelectTrigger>
          <SelectContent>
            {sectionChoices.map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
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
              form.setValue(`logicRules.${index}.sourceQuestionId`, null, {
                shouldDirty: true,
              });
              form.setValue(`logicRules.${index}.comparisonValue`, '', {
                shouldDirty: true,
              });
            } else {
              const nextQuestion = answerableQuestions.find(
                (item) => item.id === value
              );
              const nextChoices = nextQuestion
                ? getComparisonChoices(nextQuestion.id)
                : [];
              form.setValue(`logicRules.${index}.sourceQuestionId`, value, {
                shouldDirty: true,
              });
              form.setValue(
                `logicRules.${index}.comparisonValue`,
                nextChoices[0]?.value ?? '',
                { shouldDirty: true }
              );
            }
          }}
        >
          <SelectTrigger className={toneClasses.fieldClassName}>
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
              <SelectTrigger className={toneClasses.fieldClassName}>
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
                  form.setValue(`logicRules.${index}.comparisonValue`, value, {
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger className={toneClasses.fieldClassName}>
                  <SelectValue placeholder={t('studio.comparison_value')} />
                </SelectTrigger>
                <SelectContent>
                  {comparisonChoices.map((choice) => (
                    <SelectItem key={choice.value} value={choice.value}>
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
  );
}
