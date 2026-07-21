import type { FormAnswerValue, FormDefinitionQuestion } from '../types';

export function parseDateAnswer(value: FormAnswerValue | undefined) {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }

  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function formatDateAnswer(date: Date | undefined) {
  if (!date) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function hasOptionImage(
  option: FormDefinitionQuestion['options'][number]
) {
  return Boolean(option.image?.url || option.image?.storagePath);
}
