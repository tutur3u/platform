import 'server-only';

type ValseaRecord = Record<string, unknown>;

export type VoiceGradeLevel = 'amber' | 'green' | 'orange' | 'red';
export type VoiceGradeStatus =
  | 'graded'
  | 'insufficient_speech'
  | 'reference_mismatch';

export interface VoiceGradeCharacter {
  character: string;
  heard?: string;
  hint?: string;
  level: VoiceGradeLevel;
  score: number;
  status: 'matched' | 'missing' | 'substituted' | 'uncertain';
}

export interface VoiceGradeWord {
  characters: VoiceGradeCharacter[];
  expected: string;
  heard: string;
  level: VoiceGradeLevel;
  nativeScore: number;
  score: number;
}

export interface VoiceGradeResult {
  assessorModel?: string;
  heardText: string;
  nativeSimilarity: number;
  overallScore: number;
  provider: 'local-model' | 'valsea-heuristic';
  raw?: unknown;
  referenceCoverage?: number;
  referenceText: string;
  status: VoiceGradeStatus;
  summary: string;
  words: VoiceGradeWord[];
}

interface GradeVoiceInput {
  assessorModel: string;
  file: File;
  language: string;
  referenceText: string;
  transcription: ValseaRecord | null;
}

type AlignmentPair = {
  expected: string;
  heard: string;
};

type AlignmentDirection = 'delete' | 'insert' | 'match' | null;

type CharacterAlignment = {
  expected: string;
  heard: string;
  status: VoiceGradeCharacter['status'];
};

const SOFT_MISSING_TOKENS = new Set(['ah', 'lah', 'leh', 'lor', 'mah', 'one']);
const MAX_CHARACTER_ALIGNMENT_CELLS = 16_384;
const MAX_WORD_ALIGNMENT_CELLS = 65_536;

function getString(record: ValseaRecord | undefined, key: string) {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

function getNumber(record: ValseaRecord | undefined, key: string) {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function getRecordArray(record: ValseaRecord | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is ValseaRecord =>
          !!entry && typeof entry === 'object' && !Array.isArray(entry)
      )
    : [];
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreToLevel(score: number): VoiceGradeLevel {
  if (score >= 85) return 'green';
  if (score >= 70) return 'amber';
  if (score >= 50) return 'orange';
  return 'red';
}

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '');
}

function tokenizeWords(value: string) {
  return value.match(/\S+/g) ?? [];
}

function getHeardText(transcription: ValseaRecord | null) {
  return (
    getString(transcription ?? undefined, 'raw_transcript') ||
    getString(transcription ?? undefined, 'text') ||
    ''
  );
}

function isSoftMissingToken(value: string) {
  const normalized = normalizeToken(value);
  return SOFT_MISSING_TOKENS.has(normalized) || normalized.length <= 2;
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index
  );
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const deletionCost = (current[rightIndex - 1] ?? 0) + 1;
      const insertionCost = (previous[rightIndex] ?? 0) + 1;
      const substitutionDistance =
        (previous[rightIndex - 1] ?? 0) + substitutionCost;
      current[rightIndex] = Math.min(
        deletionCost,
        insertionCost,
        substitutionDistance
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index] ?? 0;
    }
  }

  return previous[right.length] ?? 0;
}

function compareTokens(expected: string, heard: string) {
  const normalizedExpected = normalizeToken(expected);
  const normalizedHeard = normalizeToken(heard);
  const maxLength = Math.max(normalizedExpected.length, normalizedHeard.length);
  if (maxLength === 0) return 100;

  const distance = levenshteinDistance(normalizedExpected, normalizedHeard);
  return clampScore((1 - distance / maxLength) * 100);
}

function getReferenceCoverage(referenceText: string, heardText: string) {
  const expectedWords = tokenizeWords(referenceText)
    .map(normalizeToken)
    .filter(Boolean);
  const heardWords = tokenizeWords(heardText)
    .map(normalizeToken)
    .filter(Boolean);

  if (expectedWords.length === 0) return 1;
  if (heardWords.length === 0) return 0;

  if (
    (expectedWords.length + 1) * (heardWords.length + 1) >
    MAX_WORD_ALIGNMENT_CELLS
  ) {
    const heardSet = new Set(heardWords);
    const matchedExpectedWords = expectedWords.filter((expected) =>
      heardSet.has(expected)
    );
    return matchedExpectedWords.length / expectedWords.length;
  }

  const matchedExpectedWords = expectedWords.filter((expected) =>
    heardWords.some((heard) => compareTokens(expected, heard) >= 82)
  );

  return matchedExpectedWords.length / expectedWords.length;
}

function getPronunciationStatus(referenceText: string, heardText: string) {
  const expectedWords = tokenizeWords(referenceText).filter(Boolean);
  const heardWords = tokenizeWords(heardText).filter(Boolean);
  const referenceCoverage = getReferenceCoverage(referenceText, heardText);

  if (expectedWords.length >= 4 && heardWords.length < 2) {
    return {
      referenceCoverage,
      status: 'insufficient_speech' as const,
    };
  }

  if (
    expectedWords.length >= 8 &&
    heardWords.length < Math.max(3, expectedWords.length * 0.35)
  ) {
    return {
      referenceCoverage,
      status: 'insufficient_speech' as const,
    };
  }

  if (expectedWords.length >= 6 && referenceCoverage < 0.35) {
    return {
      referenceCoverage,
      status: 'reference_mismatch' as const,
    };
  }

  return {
    referenceCoverage,
    status: 'graded' as const,
  };
}

function getSkippedSummary(status: Exclude<VoiceGradeStatus, 'graded'>) {
  if (status === 'insufficient_speech') {
    return 'Pronunciation grading was skipped because the recording does not contain enough of the reference phrase. Record the full phrase or clear the reference note before grading.';
  }

  return 'Pronunciation grading was skipped because the spoken transcript does not match the reference phrase. Use the actual spoken phrase as the reference or record the intended reference again.';
}

function buildSkippedGrade({
  assessorModel,
  heardText,
  provider,
  raw,
  referenceCoverage,
  referenceText,
  status,
}: {
  assessorModel?: string;
  heardText: string;
  provider: VoiceGradeResult['provider'];
  raw?: unknown;
  referenceCoverage: number;
  referenceText: string;
  status: Exclude<VoiceGradeStatus, 'graded'>;
}): VoiceGradeResult {
  return {
    assessorModel,
    heardText,
    nativeSimilarity: 0,
    overallScore: 0,
    provider,
    raw,
    referenceCoverage: Math.round(referenceCoverage * 100) / 100,
    referenceText,
    status,
    summary: getSkippedSummary(status),
    words: [],
  };
}

function alignCharacters(expected: string, heard: string) {
  const expectedCharacters = [...normalizeToken(expected)];
  const heardCharacters = [...normalizeToken(heard)];
  const rows = expectedCharacters.length + 1;
  const columns = heardCharacters.length + 1;

  if (exceedsAlignmentBudget(rows, columns, MAX_CHARACTER_ALIGNMENT_CELLS)) {
    return expectedCharacters.map<CharacterAlignment>(
      (expectedCharacter, index) => {
        const heardCharacter = heardCharacters[index] ?? '';
        return {
          expected: expectedCharacter,
          heard: heardCharacter,
          status:
            expectedCharacter === heardCharacter
              ? 'matched'
              : heardCharacter
                ? 'substituted'
                : 'missing',
        };
      }
    );
  }

  const costs: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => 0)
  );
  const directions: AlignmentDirection[][] = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => null)
  );

  for (let row = 1; row < rows; row += 1) {
    costs[row]![0] = row;
    directions[row]![0] = 'delete';
  }

  for (let column = 1; column < columns; column += 1) {
    costs[0]![column] = column;
    directions[0]![column] = 'insert';
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const expectedCharacter = expectedCharacters[row - 1] ?? '';
      const heardCharacter = heardCharacters[column - 1] ?? '';
      const substitutionCost = expectedCharacter === heardCharacter ? 0 : 1;
      const matchCost = (costs[row - 1]?.[column - 1] ?? 0) + substitutionCost;
      const deleteCost = (costs[row - 1]?.[column] ?? 0) + 1;
      const insertCost = (costs[row]?.[column - 1] ?? 0) + 1;

      if (matchCost <= deleteCost && matchCost <= insertCost) {
        costs[row]![column] = matchCost;
        directions[row]![column] = 'match';
      } else if (deleteCost <= insertCost) {
        costs[row]![column] = deleteCost;
        directions[row]![column] = 'delete';
      } else {
        costs[row]![column] = insertCost;
        directions[row]![column] = 'insert';
      }
    }
  }

  const aligned: CharacterAlignment[] = [];
  let row = expectedCharacters.length;
  let column = heardCharacters.length;

  while (row > 0 || column > 0) {
    const direction = directions[row]?.[column];
    if (direction === 'match') {
      const expectedCharacter = expectedCharacters[row - 1] ?? '';
      const heardCharacter = heardCharacters[column - 1] ?? '';
      aligned.push({
        expected: expectedCharacter,
        heard: heardCharacter,
        status:
          expectedCharacter === heardCharacter ? 'matched' : 'substituted',
      });
      row -= 1;
      column -= 1;
    } else if (direction === 'delete') {
      aligned.push({
        expected: expectedCharacters[row - 1] ?? '',
        heard: '',
        status: 'missing',
      });
      row -= 1;
    } else {
      column -= 1;
    }
  }

  return aligned.reverse();
}

function exceedsAlignmentBudget(rows: number, columns: number, budget: number) {
  return rows > Math.floor(budget / Math.max(columns, 1));
}

function scoreAlignedToken(expected: string, heard: string) {
  if (heard) return compareTokens(expected, heard);
  return isSoftMissingToken(expected) ? 78 : 45;
}

function alignWords(expectedWords: string[], heardWords: string[]) {
  const rows = expectedWords.length + 1;
  const columns = heardWords.length + 1;

  if (exceedsAlignmentBudget(rows, columns, MAX_WORD_ALIGNMENT_CELLS)) {
    return expectedWords.map<AlignmentPair>((expected, index) => ({
      expected,
      heard: heardWords[index] ?? '',
    }));
  }

  const costs: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => 0)
  );
  const directions: AlignmentDirection[][] = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => null)
  );

  for (let row = 1; row < rows; row += 1) {
    const expected = expectedWords[row - 1] ?? '';
    costs[row]![0] =
      (costs[row - 1]?.[0] ?? 0) + (isSoftMissingToken(expected) ? 0.22 : 0.72);
    directions[row]![0] = 'delete';
  }

  for (let column = 1; column < columns; column += 1) {
    costs[0]![column] = (costs[0]?.[column - 1] ?? 0) + 0.34;
    directions[0]![column] = 'insert';
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const expected = expectedWords[row - 1] ?? '';
      const heard = heardWords[column - 1] ?? '';
      const similarity = compareTokens(expected, heard) / 100;
      const matchCost = (costs[row - 1]?.[column - 1] ?? 0) + (1 - similarity);
      const deleteCost =
        (costs[row - 1]?.[column] ?? 0) +
        (isSoftMissingToken(expected) ? 0.22 : 0.72);
      const insertCost = (costs[row]?.[column - 1] ?? 0) + 0.34;

      if (matchCost <= deleteCost && matchCost <= insertCost) {
        costs[row]![column] = matchCost;
        directions[row]![column] = 'match';
      } else if (deleteCost <= insertCost) {
        costs[row]![column] = deleteCost;
        directions[row]![column] = 'delete';
      } else {
        costs[row]![column] = insertCost;
        directions[row]![column] = 'insert';
      }
    }
  }

  const pairs: AlignmentPair[] = [];
  let row = expectedWords.length;
  let column = heardWords.length;

  while (row > 0 || column > 0) {
    const direction = directions[row]?.[column];
    if (direction === 'match') {
      pairs.push({
        expected: expectedWords[row - 1] ?? '',
        heard: heardWords[column - 1] ?? '',
      });
      row -= 1;
      column -= 1;
    } else if (direction === 'delete') {
      pairs.push({
        expected: expectedWords[row - 1] ?? '',
        heard: '',
      });
      row -= 1;
    } else {
      column -= 1;
    }
  }

  return pairs.reverse();
}

function buildCharacterGrades(
  expected: string,
  heard: string,
  wordScore: number
) {
  const characterAlignment = alignCharacters(expected, heard);
  let normalizedIndex = 0;
  const isSoftMissing = !heard && isSoftMissingToken(expected);

  return [...expected].map<VoiceGradeCharacter>((character) => {
    const normalizedCharacter = normalizeToken(character);
    if (!normalizedCharacter) {
      return {
        character,
        level: 'green',
        score: 100,
        status: 'matched',
      };
    }

    const aligned = characterAlignment[normalizedIndex];
    normalizedIndex += 1;
    const status = isSoftMissing ? 'uncertain' : aligned?.status || 'missing';
    const score =
      status === 'matched'
        ? Math.max(wordScore, 92)
        : status === 'uncertain'
          ? 78
          : status === 'substituted'
            ? Math.min(72, Math.max(55, wordScore))
            : Math.min(58, Math.max(35, wordScore));

    return {
      character,
      heard: aligned?.heard,
      hint:
        status === 'matched'
          ? 'Sound matched the expected phrase.'
          : status === 'uncertain'
            ? 'ASR did not hear this short filler clearly; review manually.'
            : status === 'substituted'
              ? `Expected ${normalizedCharacter}, heard ${aligned?.heard || 'another sound'}.`
              : `Expected ${normalizedCharacter}, but ASR did not hear it.`,
      level: scoreToLevel(score),
      score: clampScore(score),
      status,
    };
  });
}

function buildHeuristicGrade(input: GradeVoiceInput): VoiceGradeResult {
  const heardText = getHeardText(input.transcription);
  const pronunciationStatus = getPronunciationStatus(
    input.referenceText,
    heardText
  );

  if (pronunciationStatus.status !== 'graded') {
    return buildSkippedGrade({
      assessorModel: input.assessorModel,
      heardText,
      provider: 'valsea-heuristic',
      raw: input.transcription,
      referenceCoverage: pronunciationStatus.referenceCoverage,
      referenceText: input.referenceText,
      status: pronunciationStatus.status,
    });
  }

  const expectedWords = tokenizeWords(input.referenceText);
  const heardWords = tokenizeWords(heardText);
  const corrections = Array.isArray(input.transcription?.corrections)
    ? input.transcription.corrections.length
    : 0;
  const correctionPenalty = Math.min(18, corrections * 3);

  const words = alignWords(expectedWords, heardWords).map<VoiceGradeWord>(
    ({ expected, heard }) => {
      const score = scoreAlignedToken(expected, heard);
      const nativeScore = clampScore(score - correctionPenalty);

      return {
        characters: buildCharacterGrades(expected, heard, score),
        expected,
        heard,
        level: scoreToLevel(score),
        nativeScore,
        score,
      };
    }
  );

  const average =
    words.length > 0
      ? words.reduce((total, word) => total + word.score, 0) / words.length
      : 0;
  const nativeAverage =
    words.length > 0
      ? words.reduce((total, word) => total + word.nativeScore, 0) /
        words.length
      : 0;
  const overallScore = clampScore(average);
  const nativeSimilarity = clampScore(nativeAverage);

  return {
    assessorModel: input.assessorModel,
    heardText,
    nativeSimilarity,
    overallScore,
    provider: 'valsea-heuristic',
    raw: input.transcription,
    referenceCoverage: pronunciationStatus.referenceCoverage,
    referenceText: input.referenceText,
    status: 'graded',
    summary:
      nativeSimilarity >= 85
        ? 'Native-like delivery with only minor classroom-level differences.'
        : nativeSimilarity >= 70
          ? 'Understandable delivery with a few sounds to tighten.'
          : nativeSimilarity >= 50
            ? 'Partly understandable, but several words need another pass.'
            : 'Needs focused pronunciation practice before using this phrase live.',
    words,
  };
}

function scoreToCharacterStatus(score: number): VoiceGradeCharacter['status'] {
  if (score >= 85) return 'matched';
  if (score >= 70) return 'uncertain';
  if (score >= 50) return 'substituted';
  return 'missing';
}

function parseCharacterStatus(
  value: string | undefined,
  score: number
): VoiceGradeCharacter['status'] {
  if (
    value === 'matched' ||
    value === 'missing' ||
    value === 'substituted' ||
    value === 'uncertain'
  ) {
    return value;
  }

  return scoreToCharacterStatus(score);
}

function normalizeExternalWord(entry: ValseaRecord): VoiceGradeWord | null {
  const expected = getString(entry, 'expected');
  if (!expected) return null;

  const heard = getString(entry, 'heard') || '';
  const score = clampScore(
    getNumber(entry, 'score') ?? compareTokens(expected, heard)
  );
  const nativeScore = clampScore(getNumber(entry, 'nativeScore') ?? score);
  const characters = getRecordArray(entry, 'characters').map((character) => {
    const rawScore = clampScore(getNumber(character, 'score') ?? score);
    return {
      character: getString(character, 'character') || '',
      heard: getString(character, 'heard'),
      hint: getString(character, 'hint'),
      level: scoreToLevel(rawScore),
      score: rawScore,
      status: parseCharacterStatus(getString(character, 'status'), rawScore),
    };
  });

  return {
    characters: characters.length
      ? characters
      : buildCharacterGrades(expected, heard, score),
    expected,
    heard,
    level: scoreToLevel(score),
    nativeScore,
    score,
  };
}

function normalizeExternalGrade(
  data: ValseaRecord,
  fallback: VoiceGradeResult
): VoiceGradeResult {
  const heardText = getString(data, 'heardText') || fallback.heardText;
  const referenceText =
    getString(data, 'referenceText') || fallback.referenceText;
  const pronunciationStatus = getPronunciationStatus(referenceText, heardText);
  const assessorModel =
    getString(data, 'assessorModel') || fallback.assessorModel;

  if (pronunciationStatus.status !== 'graded') {
    return buildSkippedGrade({
      assessorModel,
      heardText,
      provider: 'local-model',
      raw: data,
      referenceCoverage: pronunciationStatus.referenceCoverage,
      referenceText,
      status: pronunciationStatus.status,
    });
  }

  const externalWords = getRecordArray(data, 'words')
    .map(normalizeExternalWord)
    .filter((entry): entry is VoiceGradeWord => Boolean(entry));
  const externalAverage =
    externalWords.length > 0
      ? externalWords.reduce((total, word) => total + word.score, 0) /
        externalWords.length
      : 0;
  const shouldUseAlignmentGuard =
    externalWords.length === fallback.words.length &&
    fallback.overallScore - externalAverage > 20;
  const words = shouldUseAlignmentGuard ? fallback.words : externalWords;
  const fallbackScore = shouldUseAlignmentGuard
    ? fallback.overallScore
    : undefined;
  const fallbackNative = shouldUseAlignmentGuard
    ? fallback.nativeSimilarity
    : undefined;

  return {
    assessorModel,
    heardText,
    nativeSimilarity: clampScore(
      fallbackNative ??
        getNumber(data, 'nativeSimilarity') ??
        fallback.nativeSimilarity
    ),
    overallScore: clampScore(
      fallbackScore ?? getNumber(data, 'overallScore') ?? fallback.overallScore
    ),
    provider: 'local-model',
    raw: data,
    referenceCoverage: pronunciationStatus.referenceCoverage,
    referenceText,
    status: 'graded',
    summary: getString(data, 'summary') || fallback.summary,
    words: words.length ? words : fallback.words,
  };
}

async function gradeWithLocalModel(
  input: GradeVoiceInput,
  fallback: VoiceGradeResult
) {
  const endpoint = process.env.VALSEA_PRONUNCIATION_ASSESSOR_URL?.trim();
  if (!endpoint) return null;

  try {
    const formData = new FormData();
    formData.set('file', input.file, input.file.name);
    formData.set('language', input.language);
    formData.set('referenceText', input.referenceText);
    formData.set('assessorModel', input.assessorModel);
    formData.set('valseaTranscript', fallback.heardText);
    formData.set('valseaResponse', JSON.stringify(input.transcription ?? {}));

    const response = await fetch(endpoint, {
      body: formData,
      cache: 'no-store',
      method: 'POST',
    });

    if (!response.ok) {
      console.warn('Local pronunciation assessor failed', {
        status: response.status,
      });
      return null;
    }

    const data = (await response.json()) as ValseaRecord;
    return normalizeExternalGrade(data, fallback);
  } catch (error) {
    console.warn('Local pronunciation assessor unavailable', error);
    return null;
  }
}

export async function gradeVoicePronunciation(input: GradeVoiceInput) {
  const fallback = buildHeuristicGrade(input);
  return (await gradeWithLocalModel(input, fallback)) ?? fallback;
}
