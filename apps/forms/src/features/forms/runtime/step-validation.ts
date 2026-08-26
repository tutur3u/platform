import type { FormAnswerValue, FormDefinitionQuestion } from '../types';

/** An answer counts as given when it is a non-empty string or a non-empty list. */
export function isAnswered(value: FormAnswerValue | undefined): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value != null && value !== '';
}

/**
 * The required questions on this screen that have no answer yet, in the order
 * they appear.
 *
 * Order matters: the runtime reports and scrolls to the first one, and a
 * respondent sent to the third missing field while the first is off-screen
 * above them has been told the wrong thing.
 *
 * Pure on purpose — the runtime owns the error state and the scroll, so this
 * can be exercised without a DOM.
 */
export function findMissingRequiredQuestions(
  questions: readonly FormDefinitionQuestion[],
  requiredQuestionIds: ReadonlySet<string>,
  answers: Record<string, FormAnswerValue>
): FormDefinitionQuestion[] {
  return questions.filter(
    (question) =>
      requiredQuestionIds.has(question.id) && !isAnswered(answers[question.id])
  );
}

/** Brings a question into view after a failed advance. */
export function scrollToQuestion(questionId: string) {
  if (typeof document === 'undefined') return;

  requestAnimationFrame(() => {
    document
      .getElementById(`question-${questionId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}
