export interface VocabularyEntry {
  definition: string;
  examples: string[];
  id: string;
  imageUrl: string;
  pronunciation: string;
  word: string;
}

export interface MatchCard {
  entryId: string;
  id: string;
  label: string;
  side: 'definition' | 'word';
}

export interface PronunciationFeedback {
  score: number | null;
  summary: string;
  transcript: string;
  mistakes?: PronunciationMistake[];
  issues: string[];
  tips: string[];
}

export interface PronunciationMistake {
  endIndex?: number | null;
  heard: string;
  issue: string;
  startIndex?: number | null;
  suggestion: string;
  target: string;
}

export function normalizeVocabulary(value: unknown): VocabularyEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id.trim() : '';
      const word = typeof record.word === 'string' ? record.word.trim() : '';
      const definition =
        typeof record.definition === 'string' ? record.definition.trim() : '';

      if (!id || !word || !definition) return null;

      return {
        definition,
        examples: Array.isArray(record.examples)
          ? record.examples
              .filter(
                (example): example is string => typeof example === 'string'
              )
              .map((example) => example.trim())
              .filter(Boolean)
          : [],
        id,
        imageUrl:
          typeof record.imageUrl === 'string'
            ? record.imageUrl
            : typeof record.image_url === 'string'
              ? record.image_url
              : '',
        pronunciation:
          typeof record.pronunciation === 'string'
            ? record.pronunciation.trim()
            : '',
        word,
      };
    })
    .filter((entry): entry is VocabularyEntry => entry !== null);
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

export function buildCards(vocabulary: VocabularyEntry[]): MatchCard[] {
  return shuffle(
    vocabulary.flatMap((entry) => [
      {
        entryId: entry.id,
        id: `${entry.id}-word`,
        label: entry.word,
        side: 'word' as const,
      },
      {
        entryId: entry.id,
        id: `${entry.id}-definition`,
        label: entry.definition,
        side: 'definition' as const,
      },
    ])
  );
}

export function buildQuizOptions(index: number, vocabulary: VocabularyEntry[]) {
  const currentEntry = vocabulary[index];
  if (!currentEntry) return [];

  const distractors = shuffle(
    vocabulary
      .filter((entry) => entry.id !== currentEntry.id)
      .map((entry) => entry.word)
  ).slice(0, 3);

  return shuffle([currentEntry.word, ...distractors]);
}

export function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? (result.split(',')[1] ?? '') : result);
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error('Could not read recording.'));
    reader.readAsDataURL(blob);
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sentenceParts(
  sentence: string,
  mistakes: PronunciationMistake[]
) {
  const ranges = mistakes
    .map((mistake) => ({
      end: mistake.endIndex,
      start: mistake.startIndex,
    }))
    .filter(
      (range): range is { end: number; start: number } =>
        typeof range.start === 'number' &&
        typeof range.end === 'number' &&
        range.start >= 0 &&
        range.end > range.start &&
        range.end <= sentence.length
    )
    .sort((a, b) => a.start - b.start);

  if (ranges.length > 0) {
    const parts: Array<{ isMistake: boolean; text: string }> = [];
    let cursor = 0;

    for (const range of ranges) {
      if (range.start < cursor) continue;

      if (range.start > cursor) {
        parts.push({
          isMistake: false,
          text: sentence.slice(cursor, range.start),
        });
      }

      parts.push({
        isMistake: true,
        text: sentence.slice(range.start, range.end),
      });
      cursor = range.end;
    }

    if (cursor < sentence.length) {
      parts.push({ isMistake: false, text: sentence.slice(cursor) });
    }

    return parts;
  }

  const targets = mistakes
    .map((mistake) => mistake.target.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (targets.length === 0) return [{ isMistake: false, text: sentence }];

  const pattern = new RegExp(`(${targets.map(escapeRegExp).join('|')})`, 'giu');
  return sentence
    .split(pattern)
    .filter(Boolean)
    .map((text) => ({
      isMistake: targets.some(
        (target) => target.toLowerCase() === text.toLowerCase()
      ),
      text,
    }));
}
