import { getReachableQuestionIds } from './branching';
import type { FormAnswerValue, FormDefinition } from './types';

function hasMeaningfulAnswer(value: FormAnswerValue | undefined) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return value != null;
}

export function getRuntimeProgressStats(
  form: FormDefinition,
  answers: Record<string, FormAnswerValue>,
  sectionTrail: string[],
  currentSectionId: string
) {
  const questionEntries = form.sections.flatMap((section) =>
    section.questions
      .filter((question) => question.type !== 'section_break')
      .map((question) => ({
        questionId: question.id,
        sectionId: section.id,
      }))
  );
  const totalQuestions = questionEntries.length;
  const completedSectionIds = new Set(
    sectionTrail.filter((sectionId) => sectionId !== currentSectionId)
  );
  const reachableQuestionIds = new Set(getReachableQuestionIds(form, answers));
  const answeredQuestionIds = new Set(
    questionEntries
      .filter(
        ({ questionId, sectionId }) =>
          hasMeaningfulAnswer(answers[questionId]) &&
          (completedSectionIds.has(sectionId) ||
            reachableQuestionIds.has(questionId))
      )
      .map(({ questionId }) => questionId)
  );
  const skippedQuestionIds = new Set(
    questionEntries
      .filter(({ questionId, sectionId }) => {
        if (answeredQuestionIds.has(questionId)) {
          return false;
        }

        return (
          completedSectionIds.has(sectionId) ||
          !reachableQuestionIds.has(questionId)
        );
      })
      .map(({ questionId }) => questionId)
  );
  const completedCount = answeredQuestionIds.size + skippedQuestionIds.size;

  return {
    totalQuestions,
    answeredCount: answeredQuestionIds.size,
    skippedCount: skippedQuestionIds.size,
    completedCount,
    progressValue:
      totalQuestions === 0 ? 0 : (completedCount / totalQuestions) * 100,
  };
}
