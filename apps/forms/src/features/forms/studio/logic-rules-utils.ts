import { normalizeMarkdownForComparison } from '../content';
import type { FormQuestionInput } from '../schema';
import type { StudioQuestionInput } from './studio-utils';

export type LogicAnswerableQuestion = {
  id: string;
  sectionId: string;
  sectionIndex: number;
  questionIndex: number;
  title: StudioQuestionInput['title'];
  type: StudioQuestionInput['type'];
  settings: StudioQuestionInput['settings'];
  options: StudioQuestionInput['options'];
  label: string;
};

export type LogicChoice = { value: string; label: string };

export const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4)
    .toString()
    .padStart(2, '0');
  const minute = ['00', '15', '30', '45'][index % 4] ?? '00';

  return `${hour}:${minute}`;
});

export function parseDateValue(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function formatDateValue(date: Date | undefined) {
  if (!date) {
    return '';
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getOperatorOptions(questionType?: FormQuestionInput['type']) {
  if (questionType === 'short_text' || questionType === 'long_text') {
    return ['equals', 'not_equals', 'contains'] as const;
  }

  if (questionType === 'multiple_choice') {
    return ['contains', 'equals', 'not_equals'] as const;
  }

  return ['equals', 'not_equals'] as const;
}

export function normalizeComparisonValue(
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
