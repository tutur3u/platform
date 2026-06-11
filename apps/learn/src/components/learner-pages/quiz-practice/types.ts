export type Quiz = {
  content?: unknown;
  id: string;
  question: string;
  quiz_options?: Array<{
    id: string;
    value: string;
  }>;
  score: number;
  type?: string | null;
};
export type SelectedAnswer = boolean | number | null;

export type DisplayOption = {
  value: string;
};

export type MatchingPair = {
  left: string;
  right: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getArrayProperty(value: unknown, key: string): unknown[] {
  const record = asRecord(value);
  const property = record?.[key];
  return Array.isArray(property) ? property : [];
}

function displayText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

export function getMatchingPairs(content: unknown): MatchingPair[] {
  return getArrayProperty(content, 'pairs')
    .map((pair) => {
      const record = asRecord(pair);
      return {
        left: displayText(record?.left),
        right: displayText(record?.right),
      };
    })
    .filter((pair) => pair.left || pair.right);
}

export function getStringItems(content: unknown, key: string): string[] {
  return getArrayProperty(content, key).map(displayText).filter(Boolean);
}

export function getMultipleChoiceOptions(quiz: Quiz): DisplayOption[] {
  const contentOptions = getStringItems(quiz.content, 'options');
  if (contentOptions.length > 0) {
    return contentOptions.map((value) => ({ value }));
  }

  return (quiz.quiz_options ?? [])
    .map((option) => ({ value: option.value }))
    .filter((option) => option.value.trim().length > 0);
}

export function getQuizScore(quiz: Quiz) {
  return quiz.score ?? 0;
}
