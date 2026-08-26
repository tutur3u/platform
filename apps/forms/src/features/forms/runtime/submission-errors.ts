import type { validateSubmittedAnswers } from '../validation';
import { scrollToQuestion } from './step-validation';

type SubmissionValidation = ReturnType<typeof validateSubmittedAnswers>;

/**
 * Turns a failed submission into the one message worth showing.
 *
 * Missing answers beat format errors: someone who left three questions blank
 * needs to know that, not that the email they did fill in has a typo. Only
 * when nothing is missing does the first format error become the headline.
 *
 * Returns `null` when the validator reported no message at all — the field
 * highlights are then the whole story, and inventing a sentence to sit above
 * them would be noise.
 */
export function describeSubmissionFailure(
  validation: SubmissionValidation,
  t: (key: string, values?: Record<string, string | number>) => string
): string | null {
  if (validation.missingRequired.length > 0) {
    return t('runtime.missing_required_answers', {
      items: validation.missingRequired.join(', '),
    });
  }

  return validation.validationErrors[0] ?? null;
}

/**
 * Brings the first failing question into view.
 *
 * The first, not the nearest: the respondent reads top-down, and being sent to
 * the third problem while the first sits off-screen above them describes the
 * form's state rather than theirs.
 */
export function scrollToFirstSubmissionError(
  errorsByQuestionId: Record<string, string>
) {
  const firstErrorId = Object.keys(errorsByQuestionId)[0];
  if (!firstErrorId) return;

  scrollToQuestion(firstErrorId);
}
