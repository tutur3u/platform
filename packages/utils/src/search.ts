export type IntentMatchReason =
  | 'exact'
  | 'prefix'
  | 'compact'
  | 'acronym'
  | 'word-order'
  | 'contains'
  | 'fuzzy'
  | 'typo';

export type IntentSearchCandidate = {
  aliases?: readonly string[];
  keywords?: readonly string[];
  subtitle?: string | null;
  title: string;
};

export type IntentSearchResult<T extends IntentSearchCandidate> = {
  item: T;
  matchedText: string;
  reason: IntentMatchReason;
  score: number;
};

type NormalizedText = {
  compact: string;
  original: string;
  text: string;
  words: string[];
};

type CandidateMatch = {
  matchedText: string;
  reason: IntentMatchReason;
  score: number;
};

const SHORT_QUERY_MAX_LENGTH = 2;
const TYPO_DISTANCE_MAX_LENGTH = 32;

export function normalizeIntentText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function compactIntentText(value: string): string {
  return normalizeIntentText(value).replace(/\s+/g, '');
}

export function getIntentAcronym(value: string): string {
  return normalizeIntentText(value)
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('');
}

function normalize(value: string): NormalizedText {
  const text = normalizeIntentText(value);
  const words = text ? text.split(' ') : [];

  return {
    compact: words.join(''),
    original: value,
    text,
    words,
  };
}

function getCandidateTexts(candidate: IntentSearchCandidate): string[] {
  const values = [
    candidate.title,
    candidate.subtitle ?? '',
    ...(candidate.aliases ?? []),
    ...(candidate.keywords ?? []),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(values));
}

function hasOrderedCharacters(text: string, query: string): boolean {
  let queryIndex = 0;

  for (let i = 0; i < text.length && queryIndex < query.length; i += 1) {
    if (text[i] === query[queryIndex]) {
      queryIndex += 1;
    }
  }

  return queryIndex === query.length;
}

function orderedCharacterScore(text: string, query: string): number {
  let queryIndex = 0;
  let firstMatch = -1;
  let lastMatch = -1;
  let streak = 0;
  let longestStreak = 0;

  for (let i = 0; i < text.length && queryIndex < query.length; i += 1) {
    if (text[i] === query[queryIndex]) {
      if (firstMatch === -1) firstMatch = i;
      lastMatch = i;
      queryIndex += 1;
      streak += 1;
      longestStreak = Math.max(longestStreak, streak);
    } else {
      streak = 0;
    }
  }

  if (queryIndex !== query.length || firstMatch === -1 || lastMatch === -1) {
    return 0;
  }

  const span = Math.max(1, lastMatch - firstMatch + 1);
  const density = query.length / span;
  const prefixBonus = firstMatch === 0 ? 28 : Math.max(0, 18 - firstMatch);
  const streakBonus = Math.min(40, longestStreak * 8);

  return Math.round(320 + density * 110 + prefixBonus + streakBonus);
}

function boundedLevenshtein(a: string, b: string, maxDistance: number): number {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = current[0];

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const deletion = (previous[j] ?? Number.POSITIVE_INFINITY) + 1;
      const insertion = (current[j - 1] ?? Number.POSITIVE_INFINITY) + 1;
      const substitution = (previous[j - 1] ?? Number.POSITIVE_INFINITY) + cost;
      current[j] = Math.min(deletion, insertion, substitution);
      rowMin = Math.min(rowMin, current[j] ?? Number.POSITIVE_INFINITY);
    }

    if (rowMin > maxDistance) return maxDistance + 1;
    [previous, current] = [current, previous];
  }

  return previous[b.length] ?? maxDistance + 1;
}

function getTypoLimit(queryLength: number): number {
  if (queryLength < 4) return 0;
  if (queryLength < 8) return 1;
  return 2;
}

function scoreText(text: string, query: NormalizedText): CandidateMatch | null {
  const target = normalize(text);

  if (!query.text || !query.compact || !target.text) return null;

  const isShortQuery = query.compact.length <= SHORT_QUERY_MAX_LENGTH;
  const acronym = getIntentAcronym(target.original);

  if (target.text === query.text) {
    return {
      matchedText: text,
      reason: 'exact',
      score: 10_000,
    };
  }

  if (target.compact === query.compact) {
    return {
      matchedText: text,
      reason: 'compact',
      score: 9_700,
    };
  }

  if (target.text.startsWith(query.text)) {
    return {
      matchedText: text,
      reason: 'prefix',
      score: 9_200 - Math.min(300, target.text.length - query.text.length),
    };
  }

  if (target.compact.startsWith(query.compact)) {
    return {
      matchedText: text,
      reason: 'compact',
      score:
        8_900 - Math.min(300, target.compact.length - query.compact.length),
    };
  }

  if (acronym?.startsWith(query.compact)) {
    return {
      matchedText: text,
      reason: 'acronym',
      score: 8_300 - Math.min(200, acronym.length - query.compact.length),
    };
  }

  if (isShortQuery) return null;

  if (
    target.text.includes(query.text) ||
    target.compact.includes(query.compact)
  ) {
    const compactIndex = target.compact.indexOf(query.compact);
    const wordStart = target.words.some((word) => word.startsWith(query.text));

    return {
      matchedText: text,
      reason: 'contains',
      score: (wordStart ? 7_400 : 6_400) - Math.max(0, compactIndex),
    };
  }

  if (
    query.words.length > 1 &&
    query.words.every((word) =>
      target.words.some((targetWord) => targetWord.startsWith(word))
    )
  ) {
    return {
      matchedText: text,
      reason: 'word-order',
      score: 7_700 - Math.min(500, target.words.length * 20),
    };
  }

  if (hasOrderedCharacters(target.compact, query.compact)) {
    return {
      matchedText: text,
      reason: 'fuzzy',
      score: orderedCharacterScore(target.compact, query.compact),
    };
  }

  const typoLimit = getTypoLimit(query.compact.length);

  if (
    typoLimit > 0 &&
    target.compact.length <= TYPO_DISTANCE_MAX_LENGTH &&
    query.compact.length <= TYPO_DISTANCE_MAX_LENGTH
  ) {
    const candidates = [target.compact, ...target.words];
    let bestDistance = typoLimit + 1;

    for (const candidate of candidates) {
      if (Math.abs(candidate.length - query.compact.length) > typoLimit) {
        continue;
      }

      bestDistance = Math.min(
        bestDistance,
        boundedLevenshtein(candidate, query.compact, typoLimit)
      );
    }

    if (bestDistance <= typoLimit) {
      return {
        matchedText: text,
        reason: 'typo',
        score: 6_900 - bestDistance * 350,
      };
    }
  }

  return null;
}

export function scoreIntentCandidate<T extends IntentSearchCandidate>(
  item: T,
  query: string
): IntentSearchResult<T> | null {
  const normalizedQuery = normalize(query);

  if (!normalizedQuery.text) {
    return {
      item,
      matchedText: item.title,
      reason: 'exact',
      score: 0,
    };
  }

  let bestMatch: CandidateMatch | null = null;

  for (const text of getCandidateTexts(item)) {
    const match = scoreText(text, normalizedQuery);

    if (!match) continue;

    if (!bestMatch || match.score > bestMatch.score) {
      bestMatch = match;
    }
  }

  if (!bestMatch) return null;

  return {
    item,
    ...bestMatch,
  };
}

export function searchIntent<T extends IntentSearchCandidate>(
  items: readonly T[],
  query: string,
  {
    limit = 10,
    minScore = 1,
  }: {
    limit?: number;
    minScore?: number;
  } = {}
): IntentSearchResult<T>[] {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return items.slice(0, limit).map((item) => ({
      item,
      matchedText: item.title,
      reason: 'exact',
      score: 0,
    }));
  }

  return items
    .map((item, index) => {
      const result = scoreIntentCandidate(item, trimmedQuery);

      return result && result.score >= minScore ? { ...result, index } : null;
    })
    .filter((result): result is IntentSearchResult<T> & { index: number } =>
      Boolean(result)
    )
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ index: _index, ...result }) => result);
}
