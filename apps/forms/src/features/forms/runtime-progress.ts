import { isAnswerableQuestionType } from './block-utils';
import { getPlannedSectionIds } from './branching';
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
  const routeSectionIds = getPlannedSectionIds(
    form,
    currentSectionId,
    answers,
    sectionTrail
  );
  const currentRouteIndex = Math.max(
    0,
    routeSectionIds.indexOf(currentSectionId)
  );
  const completedVisitedSectionIds = new Set(
    routeSectionIds.slice(0, currentRouteIndex)
  );
  const questionEntries = routeSectionIds.flatMap((sectionId) => {
    const section = form.sections.find(
      (candidate) => candidate.id === sectionId
    );

    return (
      section?.questions
        .filter((question) => isAnswerableQuestionType(question.type))
        .map((question) => ({
          questionId: question.id,
          sectionId,
        })) ?? []
    );
  });
  const totalQuestions = questionEntries.length;
  const answeredQuestionIds = new Set(
    questionEntries
      .filter(({ questionId }) => hasMeaningfulAnswer(answers[questionId]))
      .map(({ questionId }) => questionId)
  );
  const skippedQuestionIds = new Set(
    questionEntries
      .filter(({ questionId, sectionId }) => {
        if (answeredQuestionIds.has(questionId)) {
          return false;
        }

        return completedVisitedSectionIds.has(sectionId);
      })
      .map(({ questionId }) => questionId)
  );
  const completedCount = answeredQuestionIds.size + skippedQuestionIds.size;

  return {
    routeSectionIds,
    currentSectionNumber: currentRouteIndex + 1,
    routeSectionCount: routeSectionIds.length,
    totalQuestions,
    answeredCount: answeredQuestionIds.size,
    skippedCount: skippedQuestionIds.size,
    completedCount,
    progressValue:
      totalQuestions === 0 ? 0 : (completedCount / totalQuestions) * 100,
  };
}
