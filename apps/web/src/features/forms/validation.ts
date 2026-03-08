import { getReachableQuestionIds } from './branching';
import type { FormDefinition } from './types';

export function validateSubmittedAnswers(
  form: FormDefinition,
  answers: Record<string, unknown>
) {
  const reachableQuestions = new Set(getReachableQuestionIds(form, answers));
  const missingRequired = form.sections.flatMap((section) =>
    section.questions
      .filter(
        (question) => reachableQuestions.has(question.id) && question.required
      )
      .filter((question) => {
        const value = answers[question.id];
        if (Array.isArray(value)) {
          return value.length === 0;
        }

        return value == null || value === '';
      })
      .map((question) => question.title)
  );

  return {
    valid: missingRequired.length === 0,
    missingRequired,
  };
}
