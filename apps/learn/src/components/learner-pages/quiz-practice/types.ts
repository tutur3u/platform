export type Quiz = {
  content?: unknown;
  id: string;
  question: string;
  quiz_options?: Array<{
    id: string;
    value: string;
    explanation?: string | null;
  }>;
  score: number;
  type?: string | null;
};
export type SelectedAnswer =
  | boolean
  | number
  | string
  | string[]
  | MatchingPair[]
  | null;

export type DisplayOption = {
  id: string;
  value: string;
  explanation?: string | null;
};

export type MatchingPair = {
  left: string;
  right: string;
};

function getParsedContent(content: unknown): unknown {
  if (typeof content === 'string') {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  return content;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  const parsedValue = getParsedContent(value);
  if (
    !parsedValue ||
    typeof parsedValue !== 'object' ||
    Array.isArray(parsedValue)
  )
    return null;
  return parsedValue as Record<string, unknown>;
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
  const parsedContent = getParsedContent(content);
  const pairs = Array.isArray(parsedContent)
    ? parsedContent
    : getArrayProperty(parsedContent, 'pairs');
  return pairs
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
  const parsedContent = getParsedContent(content);
  return getArrayProperty(parsedContent, key).map(displayText).filter(Boolean);
}

export function getMatchingChoices(content: unknown): string[] {
  const explicitChoices = getStringItems(content, 'choices');
  if (explicitChoices.length > 0) return explicitChoices;

  return getMatchingPairs(content)
    .map((pair) => pair.right)
    .filter(Boolean);
}

export function isMatchingAnswer(
  value: SelectedAnswer
): value is MatchingPair[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      const record = asRecord(item);
      return (
        typeof record?.left === 'string' && typeof record?.right === 'string'
      );
    })
  );
}

export function isOrderingAnswer(value: SelectedAnswer): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

export function isCompleteMatchingAnswer(
  value: SelectedAnswer,
  pairCount: number
): value is MatchingPair[] {
  return (
    isMatchingAnswer(value) &&
    value.length === pairCount &&
    value.every((pair) => pair.left.trim() && pair.right.trim())
  );
}

export function getMultipleChoiceOptions(quiz: Quiz): DisplayOption[] {
  const contentOptions = getStringItems(quiz.content, 'options');
  if (contentOptions.length > 0) {
    return contentOptions.map((value, index) => ({
      id: `content-option-${index}`,
      value,
    }));
  }

  return (quiz.quiz_options ?? [])
    .map((option) => ({
      id: option.id,
      value: option.value,
      explanation: option.explanation,
    }))
    .filter((option) => option.value.trim().length > 0);
}

export function getQuizScore(quiz: Quiz) {
  return quiz.score ?? 0;
}
