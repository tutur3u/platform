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
  'email',
  'phone',
  'number',
  'url',
  'single_choice',
  'multiple_choice',
  'dropdown',
  'ranking',
  'linear_scale',
  'rating',
  'nps',
  'date',
  'time',
] as const satisfies readonly FormQuestionInput['type'][];

/**
 * Types rendered as a single line of text, differing only in keyboard,
 * autofill and validation. Grouped so callers do not have to re-list them
 * every time a new one is added.
 */
export const TEXT_INPUT_BLOCK_TYPES = [
  'short_text',
  'email',
  'phone',
  'number',
  'url',
] as const satisfies readonly FormQuestionInput['type'][];

/** Types whose answer is an ordered or unordered list rather than a scalar. */
export const LIST_ANSWER_BLOCK_TYPES = [
  'multiple_choice',
  'ranking',
] as const satisfies readonly FormQuestionInput['type'][];

export function isTextInputQuestionType(
  type: FormQuestionInput['type']
): boolean {
  return (TEXT_INPUT_BLOCK_TYPES as readonly string[]).includes(type);
}

export function isListAnswerQuestionType(
  type: FormQuestionInput['type']
): boolean {
  return (LIST_ANSWER_BLOCK_TYPES as readonly string[]).includes(type);
}

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
