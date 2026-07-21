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

import type { FormLogicRuleInput } from '../schema';
import type { getFormToneClasses } from '../theme';
import {
  formatDateValue,
  getOperatorOptions,
  type LogicAnswerableQuestion,
  type LogicChoice,
  parseDateValue,
} from './logic-rules-utils';
import type { FormsTranslator } from './studio-translator';
import type { StudioForm, StudioSectionInput } from './studio-utils';

export function renderLogicRuleQuestionTrigger({
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
}: {
  t: FormsTranslator;
  form: StudioForm;
  index: number;
  rule: FormLogicRuleInput | undefined;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  sections: StudioSectionInput[];
  answerableQuestions: LogicAnswerableQuestion[];
  questionChoices: LogicChoice[];
  getComparisonChoices: (questionId: string) => LogicChoice[];
  operatorOptions: ReturnType<typeof getOperatorOptions>;
  sourceQuestion: LogicAnswerableQuestion | undefined;
  comparisonChoices: LogicChoice[];
  comparisonValue: string;
}) {
  return (
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
              getOperatorOptions(nextQuestion?.type)[0] ?? 'equals';
            const nextTargetSectionId =
              sections.find(
                (section) =>
                  section.id && section.id !== nextQuestion?.sectionId
              )?.id ??
              sections[0]?.id ??
              null;

            form.setValue(`logicRules.${index}.sourceQuestionId`, value, {
              shouldDirty: true,
            });
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
              form.getValues(`logicRules.${index}.actionType`) ===
              'go_to_section'
            ) {
              form.setValue(
                `logicRules.${index}.targetSectionId`,
                nextTargetSectionId,
                { shouldDirty: true }
              );
            }
          }}
        >
          <SelectTrigger className={toneClasses.fieldClassName}>
            <SelectValue placeholder={t('studio.question')} />
          </SelectTrigger>
          <SelectContent>
            {questionChoices.map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
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
  );
}
