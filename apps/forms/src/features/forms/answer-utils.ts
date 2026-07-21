import {
  normalizeMarkdownForComparison,
  normalizeMarkdownToText,
} from './content';
import type {
  FormAnswerValue,
  FormDefinition,
  FormDefinitionQuestion,
  FormResponseAnswerRow,
} from './types';

function normalizeText(value: string) {
  return normalizeMarkdownForComparison(value);
}

export function deriveOptionValue(label: string) {
  const normalized = normalizeMarkdownToText(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'option';
}

export function deriveUniqueOptionValue(
  label: string,
  existingValues: string[],
  currentValue?: string
) {
  const baseValue = deriveOptionValue(label);
  const reserved = new Set(
    existingValues.filter((value) => value && value !== currentValue)
  );

  if (!reserved.has(baseValue)) {
    return baseValue;
  }

  let suffix = 2;
  let candidate = `${baseValue}-${suffix}`;

  while (reserved.has(candidate)) {
    suffix += 1;
    candidate = `${baseValue}-${suffix}`;
  }

  return candidate;
}

function getLegacyOptionIndex(candidate: string) {
  const match = /^option-(\d+)$/i.exec(candidate.trim());

  if (!match?.[1]) {
    return null;
  }

  const index = Number(match[1]) - 1;
  return Number.isNaN(index) || index < 0 ? null : index;
}

export function findMatchingOption(
  question: FormDefinitionQuestion | undefined,
  candidate: string
) {
  if (!question || !candidate.trim()) {
    return undefined;
  }

  const normalizedCandidate = normalizeText(candidate);
  const derivedCandidate = deriveOptionValue(candidate);
  const exactMatch = question.options.find(
    (option) => option.value === candidate
  );

  if (exactMatch) {
    return exactMatch;
  }

  const labelMatch = question.options.find(
    (option) => normalizeText(option.label) === normalizedCandidate
  );

  if (labelMatch) {
    return labelMatch;
  }

  const derivedMatch = question.options.find(
    (option) =>
      deriveOptionValue(option.label) === derivedCandidate ||
      option.value === derivedCandidate
  );

  if (derivedMatch) {
    return derivedMatch;
  }

  const legacyIndex = getLegacyOptionIndex(candidate);
  return legacyIndex != null ? question.options[legacyIndex] : undefined;
}

function formatMatchedOptionLabel(
  question: FormDefinitionQuestion,
  option: { label: string; value: string }
) {
  const plainTextLabel = normalizeMarkdownToText(option.label);

  if (
    (question.type === 'linear_scale' || question.type === 'rating') &&
    plainTextLabel.trim() !== option.value.trim()
  ) {
    return `${plainTextLabel} (${option.value})`;
  }

  return plainTextLabel;
}

function stringifyFallback(value: string | number) {
  return typeof value === 'number' ? String(value) : value;
}

export function formatAnswerForQuestion(
  question: FormDefinitionQuestion | undefined,
  answer: FormAnswerValue
): {
  value: string;
  unresolvedValues: string[];
} {
  if (answer == null || answer === '') {
    return { value: '—', unresolvedValues: [] };
  }

  if (Array.isArray(answer)) {
    const resolvedValues: string[] = [];
    const unresolvedValues: string[] = [];

    for (const entry of answer) {
      const matched = findMatchingOption(question, entry);

      if (matched && question) {
        resolvedValues.push(formatMatchedOptionLabel(question, matched));
      } else {
        unresolvedValues.push(entry);
      }
    }

    const allValues = [
      ...resolvedValues,
      ...unresolvedValues.map((value) => stringifyFallback(value)),
    ];

    return {
      value: allValues.length > 0 ? allValues.join(', ') : '—',
      unresolvedValues,
    };
  }

  if (typeof answer === 'number') {
    return {
      value: stringifyFallback(answer),
      unresolvedValues: [],
    };
  }

  const matched = findMatchingOption(question, answer);
  if (matched && question) {
    return {
      value: formatMatchedOptionLabel(question, matched),
      unresolvedValues: [],
    };
  }

  return {
    value: answer,
    unresolvedValues:
      question &&
      [
        'single_choice',
        'multiple_choice',
        'dropdown',
        'linear_scale',
        'rating',
      ].includes(question.type)
        ? [answer]
        : [],
  };
}

export function restoreAnswerForQuestion(
  question: FormDefinitionQuestion | undefined,
  answer: FormAnswerValue
): {
  value: FormAnswerValue | undefined;
  unresolvedValues: string[];
} {
  if (!question || answer == null || answer === '') {
    return { value: undefined, unresolvedValues: [] };
  }

  if (question.type === 'multiple_choice') {
    const rawValues = Array.isArray(answer)
      ? answer
      : typeof answer === 'string'
        ? [answer]
        : [];
    const resolvedValues = rawValues
      .map((entry) => findMatchingOption(question, entry)?.value)
      .filter((value): value is string => Boolean(value));
    const unresolvedValues = rawValues.filter(
      (entry) => !findMatchingOption(question, entry)
    );

    return {
      value: resolvedValues.length > 0 ? resolvedValues : undefined,
      unresolvedValues,
    };
  }

  if (
    question.type === 'single_choice' ||
    question.type === 'dropdown' ||
    question.type === 'linear_scale' ||
    question.type === 'rating'
  ) {
    const rawValue =
      typeof answer === 'number'
        ? String(answer)
        : typeof answer === 'string'
          ? answer
          : '';
    const matched = findMatchingOption(question, rawValue);

    return matched
      ? {
          value: matched.value,
          unresolvedValues: [],
        }
      : {
          value:
            question.type === 'linear_scale' || question.type === 'rating'
              ? rawValue
              : undefined,
          unresolvedValues: rawValue ? [rawValue] : [],
        };
  }

  return { value: answer, unresolvedValues: [] };
}

function normalizeStoredQuestionTitle(title: string | null | undefined) {
  return normalizeMarkdownForComparison(title);
}

export function createStoredAnswerQuestionResolver(form: FormDefinition) {
  const questions = form.sections.flatMap((section) => section.questions);
  const questionById = new Map(
    questions.map((question) => [question.id, question])
  );
  const questionsByTitleAndType = new Map<string, FormDefinitionQuestion[]>();

  for (const question of questions) {
    const key = `${question.type}::${normalizeStoredQuestionTitle(question.title)}`;
    const current = questionsByTitleAndType.get(key) ?? [];
    current.push(question);
    questionsByTitleAndType.set(key, current);
  }

  return (
    answer: Pick<
      FormResponseAnswerRow,
      'question_id' | 'question_title' | 'question_type'
    >
  ): FormDefinitionQuestion | undefined => {
    if (answer.question_id) {
      const matchedById = questionById.get(answer.question_id);

      if (matchedById) {
        return matchedById;
      }
    }

    const titleKey = normalizeStoredQuestionTitle(answer.question_title);
    if (!titleKey || !answer.question_type) {
      return undefined;
    }

    const matchedByTitleAndType = questionsByTitleAndType.get(
      `${answer.question_type}::${titleKey}`
    );

    return matchedByTitleAndType?.length === 1
      ? matchedByTitleAndType[0]
      : undefined;
  };
}
