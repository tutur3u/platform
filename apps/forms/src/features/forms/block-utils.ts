import type { FormQuestionInput } from './schema';

export const CONTENT_BLOCK_TYPES = [
  'rich_text',
  'image',
  'youtube',
  'divider',
] as const satisfies readonly FormQuestionInput['type'][];

export const NON_ANSWERABLE_BLOCK_TYPES = [
  'section_break',
  ...CONTENT_BLOCK_TYPES,
] as const satisfies readonly FormQuestionInput['type'][];

export const ANSWERABLE_BLOCK_TYPES = [
  'short_text',
  'long_text',
  'single_choice',
  'multiple_choice',
  'dropdown',
  'linear_scale',
  'rating',
  'date',
  'time',
] as const satisfies readonly FormQuestionInput['type'][];

export function isAnswerableQuestionType(
  type: FormQuestionInput['type']
): boolean {
  return (ANSWERABLE_BLOCK_TYPES as readonly string[]).includes(type);
}

export function isContentBlockType(type: FormQuestionInput['type']): boolean {
  return (CONTENT_BLOCK_TYPES as readonly string[]).includes(type);
}

export function isNonAnswerableQuestionType(
  type: FormQuestionInput['type']
): boolean {
  return (NON_ANSWERABLE_BLOCK_TYPES as readonly string[]).includes(type);
}
