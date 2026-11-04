/** Tone marks are meaningful: preserve Vietnamese diacritics and canonicalize NFC. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .toLocaleLowerCase('vi')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function editDistance(
  reference: readonly string[],
  hypothesis: readonly string[]
): number {
  let previous = Array.from({ length: hypothesis.length + 1 }, (_, i) => i);
  for (const [i, expected] of reference.entries()) {
    const current = [i + 1];
    for (const [j, actual] of hypothesis.entries()) {
      current.push(
        Math.min(
          (current[j] ?? 0) + 1,
          (previous[j + 1] ?? 0) + 1,
          (previous[j] ?? 0) + Number(expected !== actual)
        )
      );
    }
    previous = current;
  }
  return previous[hypothesis.length] ?? 0;
}

export interface MetricCounts {
  wordErrors: number;
  referenceWords: number;
  characterErrors: number;
  referenceCharacters: number;
  termHits: number;
  referenceTerms: number;
}

function occurrences(tokens: string[], term: string[]): number {
  let count = 0;
  for (let i = 0; i <= tokens.length - term.length; i++) {
    if (term.every((token, j) => tokens[i + j] === token)) count++;
  }
  return count;
}

export function scoreTranscript(
  reference: string,
  hypothesis: string,
  glossary: readonly string[]
): MetricCounts {
  const expected = normalizeText(reference);
  const actual = normalizeText(hypothesis);
  const words = (text: string) => (text ? text.split(' ') : []);
  const expectedWords = words(expected);
  const actualWords = words(actual);
  const expectedCharacters = Array.from(expected.replaceAll(' ', ''));
  const actualCharacters = Array.from(actual.replaceAll(' ', ''));
  let termHits = 0;
  let referenceTerms = 0;
  for (const term of new Set(glossary.map(normalizeText).filter(Boolean))) {
    const tokens = words(term);
    const total = occurrences(expectedWords, tokens);
    referenceTerms += total;
    termHits += Math.min(total, occurrences(actualWords, tokens));
  }
  return {
    wordErrors: editDistance(expectedWords, actualWords),
    referenceWords: expectedWords.length,
    characterErrors: editDistance(expectedCharacters, actualCharacters),
    referenceCharacters: expectedCharacters.length,
    termHits,
    referenceTerms,
  };
}

export function sumCounts(rows: readonly MetricCounts[]): MetricCounts {
  return rows.reduce(
    (a, b) => ({
      wordErrors: a.wordErrors + b.wordErrors,
      referenceWords: a.referenceWords + b.referenceWords,
      characterErrors: a.characterErrors + b.characterErrors,
      referenceCharacters: a.referenceCharacters + b.referenceCharacters,
      termHits: a.termHits + b.termHits,
      referenceTerms: a.referenceTerms + b.referenceTerms,
    }),
    {
      wordErrors: 0,
      referenceWords: 0,
      characterErrors: 0,
      referenceCharacters: 0,
      termHits: 0,
      referenceTerms: 0,
    }
  );
}

export function rates(counts: MetricCounts) {
  return {
    wer: counts.referenceWords
      ? counts.wordErrors / counts.referenceWords
      : null,
    cer: counts.referenceCharacters
      ? counts.characterErrors / counts.referenceCharacters
      : null,
    termAccuracy: counts.referenceTerms
      ? counts.termHits / counts.referenceTerms
      : null,
  };
}
