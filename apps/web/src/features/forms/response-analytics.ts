import {
  createStoredAnswerQuestionResolver,
  restoreAnswerForQuestion,
} from './answer-utils';
import type {
  FormAnswerValue,
  FormDefinition,
  FormResponseAnswerRow,
  FormResponseRow,
  FormResponseSummary,
  FormResponsesQuestionAnalytics,
} from './types';

type ResponseSummarySource = Pick<
  FormResponseRow,
  'id' | 'respondent_email' | 'respondent_user_id'
>;

function extractStoredAnswerValue(
  answer: Pick<FormResponseAnswerRow, 'answer_text' | 'answer_json'>
): FormAnswerValue | null {
  if (typeof answer.answer_text === 'string' && answer.answer_text.trim()) {
    return answer.answer_text;
  }

  if (Array.isArray(answer.answer_json)) {
    return answer.answer_json.filter(
      (entry): entry is string => typeof entry === 'string'
    );
  }

  if (typeof answer.answer_json === 'number') {
    return answer.answer_json;
  }

  return null;
}

function hasAnswerValue(value: FormAnswerValue | null) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return value != null;
}

function incrementCount(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function incrementTextCount(
  counts: Map<string, { value: string; count: number }>,
  value: string
) {
  const normalized = value.trim().toLowerCase();
  const existing = counts.get(normalized);

  if (existing) {
    existing.count += 1;
    return;
  }

  counts.set(normalized, {
    value,
    count: 1,
  });
}

function toPercentage(count: number, totalSubmissions: number) {
  if (totalSubmissions === 0) {
    return 0;
  }

  return Math.round((count * 100) / totalSubmissions);
}

function sortUnmatchedAnswers(
  counts: Map<string, number>,
  totalSubmissions: number
) {
  return Array.from(counts.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
    .map(([value, count]) => ({
      value,
      count,
      percentage: toPercentage(count, totalSubmissions),
    }));
}

function sortTextResponses(
  counts: Map<string, { value: string; count: number }>,
  totalAnswers: number
) {
  return Array.from(counts.values())
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.value.localeCompare(right.value);
    })
    .map((entry) => ({
      value: entry.value,
      count: entry.count,
      percentage: toPercentage(entry.count, totalAnswers),
    }));
}

export function buildResponseSummary(
  responses: ResponseSummarySource[]
): FormResponseSummary {
  const responderKeys = new Set<string>();
  const authenticatedResponders = new Set<string>();
  const duplicateCounts = new Map<string, number>();
  let anonymousSubmissions = 0;

  for (const response of responses) {
    if (response.respondent_user_id) {
      responderKeys.add(`user:${response.respondent_user_id}`);
      authenticatedResponders.add(response.respondent_user_id);
      duplicateCounts.set(
        response.respondent_user_id,
        (duplicateCounts.get(response.respondent_user_id) ?? 0) + 1
      );
      continue;
    }

    if (
      typeof response.respondent_email === 'string' &&
      response.respondent_email.trim()
    ) {
      responderKeys.add(
        `email:${response.respondent_email.trim().toLowerCase()}`
      );
      continue;
    }

    anonymousSubmissions += 1;
    responderKeys.add(`anon:${response.id}`);
  }

  const duplicateAuthenticatedEntries = Array.from(
    duplicateCounts.values()
  ).filter((count) => count > 1);

  return {
    totalSubmissions: responses.length,
    totalResponders: responderKeys.size,
    authenticatedResponders: authenticatedResponders.size,
    anonymousSubmissions,
    duplicateAuthenticatedResponders: duplicateAuthenticatedEntries.length,
    duplicateAuthenticatedSubmissions: duplicateAuthenticatedEntries.reduce(
      (sum, count) => sum + count,
      0
    ),
    hasMultipleSubmissionsByUser: duplicateAuthenticatedEntries.length > 0,
  };
}

export function buildQuestionAnalytics(
  form: FormDefinition,
  answerRows: FormResponseAnswerRow[]
): FormResponsesQuestionAnalytics[] {
  const questions = form.sections.flatMap((section) =>
    section.questions.filter((question) => question.type !== 'section_break')
  );
  const questionMap = new Map(
    questions.map((question) => [
      question.id,
      {
        question,
        totalAnswers: 0,
        counts: new Map<string, number>(),
        unmatchedCounts: new Map<string, number>(),
        textCounts: new Map<string, { value: string; count: number }>(),
        numericScores: [] as number[],
      },
    ])
  );
  const resolveStoredQuestion = createStoredAnswerQuestionResolver(form);

  for (const answer of answerRows) {
    const question = resolveStoredQuestion(answer);
    if (!question) {
      continue;
    }
    const analytics = questionMap.get(question.id);
    if (!analytics) {
      continue;
    }

    const rawValue = extractStoredAnswerValue(answer);
    if (!hasAnswerValue(rawValue)) {
      continue;
    }

    analytics.totalAnswers += 1;
    const restored = restoreAnswerForQuestion(analytics.question, rawValue);

    if (analytics.question.type === 'multiple_choice') {
      const resolvedValues = Array.isArray(restored.value)
        ? restored.value
        : [];

      for (const value of resolvedValues) {
        incrementCount(analytics.counts, value);
      }

      for (const value of restored.unresolvedValues) {
        incrementCount(analytics.unmatchedCounts, value);
      }

      continue;
    }

    if (
      analytics.question.type === 'short_text' ||
      analytics.question.type === 'long_text'
    ) {
      if (typeof rawValue === 'string' && rawValue.trim()) {
        incrementTextCount(analytics.textCounts, rawValue.trim());
      }

      continue;
    }

    const resolvedScalar =
      typeof restored.value === 'string'
        ? restored.value
        : typeof restored.value === 'number'
          ? String(restored.value)
          : null;

    if (
      analytics.question.type === 'single_choice' ||
      analytics.question.type === 'dropdown'
    ) {
      if (resolvedScalar) {
        incrementCount(analytics.counts, resolvedScalar);
      }

      for (const value of restored.unresolvedValues) {
        incrementCount(analytics.unmatchedCounts, value);
      }

      continue;
    }

    if (
      analytics.question.type === 'rating' ||
      analytics.question.type === 'linear_scale'
    ) {
      const hasMatchingScaleOption =
        resolvedScalar != null &&
        analytics.question.options.some(
          (option) => option.value === resolvedScalar
        );

      if (resolvedScalar) {
        if (hasMatchingScaleOption) {
          incrementCount(analytics.counts, resolvedScalar);
        } else {
          incrementCount(analytics.unmatchedCounts, resolvedScalar);
        }

        const numericScore = Number(resolvedScalar);
        if (!Number.isNaN(numericScore)) {
          analytics.numericScores.push(numericScore);
        }
      }

      for (const value of restored.unresolvedValues) {
        if (value !== resolvedScalar) {
          incrementCount(analytics.unmatchedCounts, value);
        }
      }
    }
  }

  return questions.map((question) => {
    const analytics = questionMap.get(question.id);
    const parsed: FormResponsesQuestionAnalytics = {
      questionId: question.id,
      title: question.title,
      type: question.type,
      totalAnswers: analytics?.totalAnswers ?? 0,
    };

    if (
      question.type === 'single_choice' ||
      question.type === 'multiple_choice' ||
      question.type === 'dropdown'
    ) {
      parsed.choices = question.options.map((option) => {
        const count = analytics?.counts.get(option.value) ?? 0;

        return {
          label: option.label,
          value: option.value,
          count,
          percentage: toPercentage(count, analytics?.totalAnswers ?? 0),
        };
      });
    }

    if (question.type === 'rating' || question.type === 'linear_scale') {
      parsed.scale = question.options.map((option) => {
        const count = analytics?.counts.get(option.value) ?? 0;

        return {
          score: option.value,
          label: option.label,
          count,
          percentage: toPercentage(count, analytics?.totalAnswers ?? 0),
        };
      });

      if ((analytics?.numericScores.length ?? 0) > 0) {
        const totalScore =
          analytics?.numericScores.reduce((sum, score) => sum + score, 0) ?? 0;
        parsed.meanScore = Number(
          (totalScore / (analytics?.numericScores.length ?? 1)).toFixed(1)
        );
      }
    }

    if ((analytics?.unmatchedCounts.size ?? 0) > 0) {
      parsed.unmatchedAnswers = sortUnmatchedAnswers(
        analytics!.unmatchedCounts,
        analytics?.totalAnswers ?? 0
      );
    }

    if ((analytics?.textCounts.size ?? 0) > 0) {
      parsed.textResponses = sortTextResponses(
        analytics!.textCounts,
        analytics?.totalAnswers ?? 0
      );
    }

    return parsed;
  });
}
