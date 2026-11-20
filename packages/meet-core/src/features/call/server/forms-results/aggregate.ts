import { normalizeMarkdownToText } from '../../../../../../../apps/forms/src/features/forms/content';
import { buildQuestionAnalytics } from '../../../../../../../apps/forms/src/features/forms/response-analytics';
import type {
  FormDefinition,
  FormResponseAnswerRow,
  FormResponsesQuestionAnalytics,
} from '../../../../../../../apps/forms/src/features/forms/types';
import { meetFormAnswerId } from '../forms/response-ids';
import type { FormsResults } from './results';

type Launch = {
  meetingId: string;
  launchId: string;
  formId: string;
  versionId: string;
  form: FormDefinition;
};

function projectBreakdown(question: FormResponsesQuestionAnalytics) {
  if (question.choices) {
    return question.choices.map(({ label, count }) => ({ label, count }));
  }
  if (question.scale) {
    return question.scale.map(({ label, score, count }) => ({
      label: label || score,
      count,
    }));
  }
  if (question.nps) {
    return question.nps.distribution.map(({ score, count }) => ({
      label: String(score),
      count,
    }));
  }
  return question.ranking?.map(({ label, count }) => ({ label, count })) ?? [];
}

export function aggregateFormsResults(
  { form, ...binding }: Launch,
  responses: { answers: FormResponseAnswerRow[] }[]
): FormsResults & { meetingId: string } {
  const questions = new Set(
    form.sections.flatMap((section) => section.questions.map(({ id }) => id))
  );
  const rows = responses.flatMap(({ answers }) => {
    const byQuestion = new Map<string, FormResponseAnswerRow>();
    for (const answer of answers) {
      // The live question FK can be cleared after a launch. The persisted
      // answer ID binds it to its pinned question even when labels repeat.
      const questionId =
        answer.question_id ??
        Array.from(questions).find(
          (id) => meetFormAnswerId(answer.response_id, id) === answer.id
        );
      if (questionId && questions.has(questionId)) {
        byQuestion.set(questionId, { ...answer, question_id: questionId });
      }
    }
    return [...byQuestion.values()];
  });

  return {
    ...binding,
    title: normalizeMarkdownToText(form.title),
    responseMode: form.accessMode === 'anonymous' ? 'anonymous' : 'named',
    responseCount: responses.length,
    questions: buildQuestionAnalytics(form, rows).map((question) => ({
      id: question.questionId,
      title: question.title,
      answeredCount: question.totalAnswers,
      breakdown: projectBreakdown(question),
    })),
  };
}
