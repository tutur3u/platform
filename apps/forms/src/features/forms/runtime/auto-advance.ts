import type { FormQuestionInput } from '../schema';

/**
 * Types that auto-advance once answered.
 *
 * The test is whether the answer is *complete* the moment it is given. Picking
 * a rating or a single choice is one gesture and it is done; typing, choosing
 * several options, or dragging a ranking into order are all states a
 * respondent passes through on the way to an answer, and advancing out of one
 * mid-thought is worse than the extra click auto-advance exists to remove.
 */
const AUTO_ADVANCE_TYPES = new Set<FormQuestionInput['type']>([
  'single_choice',
  'dropdown',
  'linear_scale',
  'rating',
  'nps',
]);

export function isAutoAdvanceType(type: FormQuestionInput['type']): boolean {
  return AUTO_ADVANCE_TYPES.has(type);
}

/**
 * How long to wait before moving on, in milliseconds.
 *
 * Long enough to see the option register as selected — advancing instantly
 * reads as the form skipping rather than responding, and leaves the respondent
 * unsure what they picked — and short enough not to feel like waiting.
 */
export const AUTO_ADVANCE_DELAY_MS = 380;

/**
 * Whether this answer should trigger a move to the next screen.
 *
 * Requires exactly one answerable question on the screen: with two, advancing
 * when the first is answered would skip past the second unanswered one.
 */
export function shouldAutoAdvance({
  enabled,
  answerableCount,
  type,
  value,
}: {
  enabled: boolean;
  answerableCount: number;
  type: FormQuestionInput['type'];
  value: unknown;
}): boolean {
  if (!enabled) return false;
  if (answerableCount !== 1) return false;
  if (!isAutoAdvanceType(type)) return false;

  // Clearing an answer must not advance — deselecting is the respondent
  // correcting themselves, and moving on would take the correction away.
  if (value == null || value === '') return false;
  if (Array.isArray(value)) return false;

  return true;
}
