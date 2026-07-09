'use client';

import { BookOpen, Check, RotateCcw, Sparkles } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ContentCard } from './content-card';

interface VocabularyEntry {
  definition: string;
  examples: string[];
  id: string;
  imageUrl: string;
  pronunciation: string;
  word: string;
}

type MatchSide = 'definition' | 'word';

interface MatchCard {
  entryId: string;
  id: string;
  label: string;
  side: MatchSide;
}

interface PronunciationFeedback {
  score: number | null;
  summary: string;
  transcript: string;
  mistakes?: PronunciationMistake[];
  issues: string[];
  tips: string[];
}

interface PronunciationMistake {
  endIndex?: number | null;
  heard: string;
  issue: string;
  startIndex?: number | null;
  suggestion: string;
  target: string;
}

function normalizeVocabulary(value: unknown): VocabularyEntry[] {
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

function buildCards(vocabulary: VocabularyEntry[]): MatchCard[] {
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

function blobToBase64(blob: Blob) {
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

function sentenceParts(sentence: string, mistakes: PronunciationMistake[]) {
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

export function LearnerVocabulary({ moduleId }: { moduleId: string }) {
  const params = useParams<{ wsId?: string }>();
  const wsId = params?.wsId;
  const [vocabulary, setVocabulary] = useState<VocabularyEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [cards, setCards] = useState<MatchCard[]>([]);
  const [selected, setSelected] = useState<MatchCard | null>(null);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [mismatchIds, setMismatchIds] = useState<string[]>([]);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  // Quiz/Flashcard State
  const [practiceMode, setPracticeMode] = useState<
    'match' | 'pronunciation' | 'quiz' | null
  >(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [quizSelectedOption, setQuizSelectedOption] = useState<string | null>(
    null
  );
  const [quizCorrectCount, setQuizCorrectCount] = useState(0);
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [pronunciationIndex, setPronunciationIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzingPronunciation, setIsAnalyzingPronunciation] =
    useState(false);
  const [pronunciationError, setPronunciationError] = useState<string | null>(
    null
  );
  const [pronunciationFeedback, setPronunciationFeedback] =
    useState<PronunciationFeedback | null>(null);
  const [recordingPreviewUrl, setRecordingPreviewUrl] = useState<string | null>(
    null
  );
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const matchedSet = useMemo(() => new Set(matchedIds), [matchedIds]);
  const finished = cards.length > 0 && matchedIds.length === cards.length;

  useEffect(() => {
    if (!wsId) return;

    let cancelled = false;

    async function loadVocabulary() {
      try {
        setIsLoading(true);
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/course-modules/${moduleId}/vocabulary`,
          {
            credentials: 'include',
          }
        );

        if (!response.ok) {
          throw new Error('Failed to load vocabulary.');
        }

        const payload = (await response.json()) as { vocabulary?: unknown };

        if (!cancelled) {
          setVocabulary(normalizeVocabulary(payload.vocabulary));
        }
      } catch (error) {
        console.error('Failed to load learner vocabulary', error);
        if (!cancelled) {
          setVocabulary([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadVocabulary();

    return () => {
      cancelled = true;
    };
  }, [moduleId, wsId]);

  function generateQuizOptions(index: number, vocabList: VocabularyEntry[]) {
    if (vocabList.length === 0 || index >= vocabList.length) return;
    const currentEntry = vocabList[index];
    if (!currentEntry) return;
    const correctWord = currentEntry.word;

    const distractors = vocabList
      .filter((entry) => entry.id !== currentEntry.id)
      .map((entry) => entry.word);

    const shuffledDistractors = shuffle(distractors).slice(0, 3);
    const options = shuffle([correctWord, ...shuffledDistractors]);
    setQuizOptions(options);
  }

  const pronunciationItems = useMemo(
    () =>
      vocabulary
        .map((entry) => ({
          entry,
          sentence: entry.examples[0] ?? entry.definition,
        }))
        .filter((item) => item.sentence.trim().length > 0),
    [vocabulary]
  );

  function startPractice(mode: 'match' | 'pronunciation' | 'quiz') {
    setPracticeMode(mode);
    if (mode === 'match') {
      setCards(buildCards(vocabulary));
      setMatchedIds([]);
      setMismatchIds([]);
      setSelected(null);
    } else if (mode === 'quiz') {
      setQuizIndex(0);
      setQuizCorrectCount(0);
      setQuizSelectedOption(null);
      setQuizAnswered(false);
      generateQuizOptions(0, vocabulary);
    } else {
      setPronunciationIndex(0);
      setPronunciationFeedback(null);
      setPronunciationError(null);
    }
    setStarted(true);
  }

  async function playSpeech(
    text: string,
    kind: 'example' | 'word',
    key: string
  ) {
    try {
      setPlayingKey(key);
      const response = await fetch('/api/v1/vocabulary/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ kind, text }),
      });

      if (!response.ok) {
        throw new Error('Could not generate speech.');
      }

      const audioUrl = URL.createObjectURL(await response.blob());
      const audio = new Audio(audioUrl);
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      audio.onerror = () => URL.revokeObjectURL(audioUrl);
      await audio.play();
    } catch (error) {
      console.error('Failed to play vocabulary speech', error);
    } finally {
      setPlayingKey(null);
    }
  }

  function cancelActiveRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    recorder.ondataavailable = null;
    recorder.onstop = null;

    if (recorder.state !== 'inactive') {
      recorder.stop();
    }

    recorder.stream.getTracks().forEach((track) => {
      track.stop();
    });
    mediaRecorderRef.current = null;
  }

  function resetPractice() {
    cancelActiveRecording();
    if (recordingPreviewUrl) {
      URL.revokeObjectURL(recordingPreviewUrl);
    }
    setStarted(false);
    setPracticeMode(null);
    setCards([]);
    setMatchedIds([]);
    setMismatchIds([]);
    setSelected(null);
    setQuizIndex(0);
    setQuizCorrectCount(0);
    setQuizSelectedOption(null);
    setQuizAnswered(false);
    setPronunciationIndex(0);
    setIsRecording(false);
    setIsAnalyzingPronunciation(false);
    setPronunciationError(null);
    setPronunciationFeedback(null);
    setRecordingPreviewUrl(null);
  }

  async function analyzePronunciation(blob: Blob, targetText: string) {
    try {
      setIsAnalyzingPronunciation(true);
      setPronunciationError(null);
      setPronunciationFeedback(null);

      const audioData = await blobToBase64(blob);
      const response = await fetch('/api/v1/vocabulary/pronunciation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          audioData,
          mimeType: blob.type || 'audio/webm',
          targetText,
        }),
      });

      if (!response.ok) {
        throw new Error('Could not analyze pronunciation.');
      }

      const payload = (await response.json()) as PronunciationFeedback;
      setPronunciationFeedback({
        issues: Array.isArray(payload.issues) ? payload.issues : [],
        mistakes: Array.isArray(payload.mistakes) ? payload.mistakes : [],
        score: typeof payload.score === 'number' ? payload.score : null,
        summary: payload.summary || 'Pronunciation checked.',
        tips: Array.isArray(payload.tips) ? payload.tips : [],
        transcript: payload.transcript || '',
      });
    } catch (error) {
      console.error('Failed to analyze pronunciation', error);
      setPronunciationError(
        'Could not analyze your recording. Please try again.'
      );
    } finally {
      setIsAnalyzingPronunciation(false);
    }
  }

  async function startRecording(targetText: string) {
    try {
      setPronunciationError(null);
      setPronunciationFeedback(null);
      if (recordingPreviewUrl) {
        URL.revokeObjectURL(recordingPreviewUrl);
      }
      setRecordingPreviewUrl(null);
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        setRecordingPreviewUrl(URL.createObjectURL(audioBlob));
        void analyzePronunciation(audioBlob, targetText);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start pronunciation recording', error);
      setPronunciationError('Please allow microphone access to record.');
      setIsRecording(false);
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    setIsRecording(false);
  }

  function nextPronunciationPrompt() {
    cancelActiveRecording();
    setIsRecording(false);
    setPronunciationFeedback(null);
    setPronunciationError(null);
    if (recordingPreviewUrl) {
      URL.revokeObjectURL(recordingPreviewUrl);
    }
    setRecordingPreviewUrl(null);
    setPronunciationIndex((current) =>
      Math.min(current + 1, Math.max(0, pronunciationItems.length - 1))
    );
  }

  function selectCard(card: MatchCard) {
    if (matchedSet.has(card.id)) return;

    if (!selected) {
      setSelected(card);
      return;
    }

    if (selected.id === card.id) {
      setSelected(null);
      return;
    }

    const isMatch =
      selected.entryId === card.entryId && selected.side !== card.side;

    if (isMatch) {
      setMatchedIds((current) => [...current, selected.id, card.id]);
      setSelected(null);
      return;
    }

    setMismatchIds([selected.id, card.id]);
    window.setTimeout(() => {
      setMismatchIds([]);
      setSelected(null);
    }, 650);
  }

  function selectQuizOption(option: string) {
    if (quizAnswered) return;
    setQuizSelectedOption(option);
    setQuizAnswered(true);

    const currentEntry = vocabulary[quizIndex];
    if (currentEntry && option === currentEntry.word) {
      setQuizCorrectCount((c) => c + 1);
    }
  }

  function nextQuizQuestion() {
    const nextIndex = quizIndex + 1;
    setQuizIndex(nextIndex);
    setQuizSelectedOption(null);
    setQuizAnswered(false);
    if (nextIndex < vocabulary.length) {
      generateQuizOptions(nextIndex, vocabulary);
    }
  }

  return (
    <ContentCard
      icon={<BookOpen className="h-4 w-4" />}
      title={`Vocabulary (${vocabulary.length})`}
    >
      {isLoading ? (
        <div className="space-y-3">
          <div className="h-20 animate-pulse border-2 border-border bg-muted/60 shadow-[3px_3px_0_var(--border)]" />
          <div className="h-20 animate-pulse border-2 border-border bg-muted/60 shadow-[3px_3px_0_var(--border)]" />
        </div>
      ) : vocabulary.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No vocabulary has been added for this module yet.
        </p>
      ) : !started ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-border bg-background p-4 shadow-[3px_3px_0_var(--border)]">
            <div>
              <p className="font-black text-base">Learn the words first</p>
              <p className="text-muted-foreground text-sm">
                Review each word, pronunciation, definition, and example.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex items-center gap-2 border-2 border-border bg-primary px-4 py-2 font-black text-primary-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
                onClick={() => startPractice('match')}
                type="button"
              >
                Practice: Match
              </button>
              <button
                className="inline-flex items-center gap-2 border-2 border-border bg-dynamic-cyan px-4 py-2 font-black text-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
                onClick={() => startPractice('quiz')}
                type="button"
              >
                Practice: Quiz
              </button>
              <button
                className="inline-flex items-center gap-2 border-2 border-border bg-dynamic-yellow px-4 py-2 font-black text-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
                onClick={() => startPractice('pronunciation')}
                type="button"
              >
                Practice: Pronunciation
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {vocabulary.map((entry) => (
              <article
                className="border-2 border-border bg-background p-4 shadow-[3px_3px_0_var(--border)]"
                key={entry.id}
              >
                {entry.imageUrl ? (
                  <Image
                    alt={`${entry.word} vocabulary`}
                    className="mb-4 aspect-video w-full border-2 border-border object-cover shadow-[3px_3px_0_var(--border)]"
                    height={360}
                    unoptimized
                    referrerPolicy="no-referrer"
                    src={entry.imageUrl}
                    width={640}
                  />
                ) : null}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-base">{entry.word}</h3>
                    {entry.pronunciation ? (
                      <p className="text-muted-foreground text-xs">
                        {entry.pronunciation}
                      </p>
                    ) : null}
                  </div>
                  <Sparkles className="h-4 w-4 shrink-0 text-dynamic-yellow" />
                </div>
                <button
                  className="mt-3 border-2 border-border bg-card px-3 py-1.5 font-bold text-xs shadow-[2px_2px_0_var(--border)] disabled:opacity-50"
                  disabled={playingKey !== null}
                  onClick={() =>
                    playSpeech(entry.word, 'word', `${entry.id}-word`)
                  }
                  type="button"
                >
                  {playingKey === `${entry.id}-word`
                    ? 'Playing...'
                    : 'Play word'}
                </button>
                <p className="mt-3 text-sm leading-relaxed">
                  {entry.definition}
                </p>
                {entry.examples.length > 0 ? (
                  <ul className="mt-3 space-y-2 text-muted-foreground text-xs">
                    {entry.examples.map((example) => (
                      <li
                        className="flex flex-wrap items-center gap-2"
                        key={`${entry.id}-${example}`}
                      >
                        <span>{example}</span>
                        <button
                          className="border border-border bg-card px-2 py-0.5 font-bold text-[10px] text-foreground shadow-[1px_1px_0_var(--border)] disabled:opacity-50"
                          disabled={playingKey !== null}
                          onClick={() =>
                            playSpeech(
                              example,
                              'example',
                              `${entry.id}-${example}`
                            )
                          }
                          type="button"
                        >
                          {playingKey === `${entry.id}-${example}`
                            ? 'Playing...'
                            : 'Play example'}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : practiceMode === 'pronunciation' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-bold text-sm">
              Pronunciation {pronunciationIndex + 1} /{' '}
              {Math.max(pronunciationItems.length, 1)}
            </p>
            <button
              className="inline-flex items-center gap-2 border-2 border-border bg-background px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)]"
              onClick={resetPractice}
              type="button"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Review words
            </button>
          </div>

          {pronunciationItems.length === 0 ? (
            <div className="border-2 border-border bg-background p-6 text-muted-foreground text-sm shadow-[4px_4px_0_var(--border)]">
              Add at least one example sentence or definition to practice
              pronunciation.
            </div>
          ) : (
            (() => {
              const item = pronunciationItems[pronunciationIndex];
              if (!item) return null;

              return (
                <div className="space-y-5 border-2 border-border bg-background p-6 shadow-[4px_4px_0_var(--border)]">
                  <div className="grid gap-5 md:grid-cols-[14rem_minmax(0,1fr)]">
                    {item.entry.imageUrl ? (
                      <Image
                        alt={`${item.entry.word} vocabulary`}
                        className="aspect-video w-full border-2 border-border object-cover shadow-[3px_3px_0_var(--border)] md:aspect-square"
                        height={320}
                        unoptimized
                        referrerPolicy="no-referrer"
                        src={item.entry.imageUrl}
                        width={320}
                      />
                    ) : (
                      <div className="flex aspect-video items-center justify-center border-2 border-border border-dashed bg-muted/20 text-muted-foreground text-xs shadow-[3px_3px_0_var(--border)] md:aspect-square">
                        No image
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <p className="font-black text-2xl">{item.entry.word}</p>
                        {item.entry.pronunciation ? (
                          <p className="text-muted-foreground text-sm">
                            {item.entry.pronunciation}
                          </p>
                        ) : null}
                      </div>

                      <div className="border-2 border-border bg-card p-4 shadow-[2px_2px_0_var(--border)]">
                        <p className="mb-2 font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
                          Read this sentence
                        </p>
                        <p className="text-base leading-relaxed">
                          {item.sentence}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          className="border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-50"
                          disabled={playingKey !== null}
                          onClick={() =>
                            playSpeech(
                              item.sentence,
                              'example',
                              `${item.entry.id}-pronunciation-target`
                            )
                          }
                          type="button"
                        >
                          {playingKey ===
                          `${item.entry.id}-pronunciation-target`
                            ? 'Playing...'
                            : 'Play target'}
                        </button>
                        <button
                          className="border-2 border-border bg-primary px-3 py-1.5 font-bold text-primary-foreground text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-50"
                          disabled={isAnalyzingPronunciation}
                          onClick={() =>
                            isRecording
                              ? stopRecording()
                              : startRecording(item.sentence)
                          }
                          type="button"
                        >
                          {isRecording ? 'Stop recording' : 'Start recording'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {isRecording ? (
                    <p className="border-2 border-dynamic-yellow/50 bg-dynamic-yellow/10 p-3 font-bold text-sm shadow-[2px_2px_0_var(--border)]">
                      Recording... read the sentence clearly, then stop.
                    </p>
                  ) : null}

                  {isAnalyzingPronunciation ? (
                    <p className="text-muted-foreground text-sm">
                      Checking pronunciation...
                    </p>
                  ) : null}

                  {recordingPreviewUrl ? (
                    <div className="space-y-2 border-2 border-border bg-card p-4 shadow-[3px_3px_0_var(--border)]">
                      <p className="font-bold text-xs uppercase tracking-widest">
                        Your recording
                      </p>
                      <audio
                        className="w-full"
                        controls
                        src={recordingPreviewUrl}
                      />
                    </div>
                  ) : null}

                  {pronunciationError ? (
                    <p className="text-destructive text-sm">
                      {pronunciationError}
                    </p>
                  ) : null}

                  {pronunciationFeedback ? (
                    <div className="space-y-4 border-2 border-border bg-card p-4 shadow-[3px_3px_0_var(--border)]">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-black text-base">
                            Pronunciation feedback
                          </p>
                          <p className="text-muted-foreground text-sm">
                            {pronunciationFeedback.summary}
                          </p>
                        </div>
                        {typeof pronunciationFeedback.score === 'number' ? (
                          <div className="border-2 border-border bg-background px-3 py-2 text-center shadow-[2px_2px_0_var(--border)]">
                            <p className="font-black text-xl">
                              {pronunciationFeedback.score}/100
                            </p>
                          </div>
                        ) : null}
                      </div>

                      {pronunciationFeedback.transcript ? (
                        <p className="text-sm">
                          <span className="font-bold">Heard:</span>{' '}
                          {pronunciationFeedback.transcript}
                        </p>
                      ) : null}

                      {pronunciationFeedback.mistakes?.length ? (
                        <div className="space-y-3">
                          <div className="border-2 border-dynamic-yellow/50 bg-dynamic-yellow/10 p-3 shadow-[2px_2px_0_var(--border)]">
                            <p className="mb-2 font-bold text-xs uppercase tracking-widest">
                              Sentence map
                            </p>
                            <p className="text-base leading-relaxed">
                              {sentenceParts(
                                item.sentence,
                                pronunciationFeedback.mistakes
                              ).map((part, index) =>
                                part.isMistake ? (
                                  <mark
                                    className="border-2 border-dynamic-yellow bg-dynamic-yellow px-1 font-black text-black shadow-[1px_1px_0_var(--border)]"
                                    key={`${part.text}-${index}`}
                                  >
                                    {part.text}
                                  </mark>
                                ) : (
                                  <span key={`${part.text}-${index}`}>
                                    {part.text}
                                  </span>
                                )
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="mb-2 font-bold text-xs uppercase tracking-widest">
                              Parts to practice
                            </p>
                            <ul className="space-y-2 text-sm">
                              {pronunciationFeedback.mistakes.map(
                                (mistake, index) => (
                                  <li
                                    className="border border-border bg-background p-3"
                                    key={`${mistake.target}-${index}`}
                                  >
                                    <p>
                                      <span className="font-bold">Target:</span>{' '}
                                      {mistake.target}
                                      {mistake.heard ? (
                                        <>
                                          {' '}
                                          <span className="text-muted-foreground">
                                            sounded like
                                          </span>{' '}
                                          {mistake.heard}
                                        </>
                                      ) : null}
                                    </p>
                                    <p className="mt-1 text-muted-foreground">
                                      {mistake.issue}
                                    </p>
                                    {mistake.suggestion ? (
                                      <p className="mt-1 font-bold">
                                        Try: {mistake.suggestion}
                                      </p>
                                    ) : null}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        </div>
                      ) : null}

                      {pronunciationFeedback.issues.length > 0 ? (
                        <div>
                          <p className="mb-2 font-bold text-xs uppercase tracking-widest">
                            What to fix
                          </p>
                          <ul className="space-y-1 text-sm">
                            {pronunciationFeedback.issues.map((issue) => (
                              <li key={issue}>- {issue}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {pronunciationFeedback.tips.length > 0 ? (
                        <div>
                          <p className="mb-2 font-bold text-xs uppercase tracking-widest">
                            Practice tips
                          </p>
                          <ul className="space-y-1 text-sm">
                            {pronunciationFeedback.tips.map((tip) => (
                              <li key={tip}>- {tip}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex justify-end">
                    <button
                      className="border-2 border-border bg-background px-4 py-2 font-bold text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-50"
                      disabled={
                        pronunciationIndex + 1 >= pronunciationItems.length
                      }
                      onClick={nextPronunciationPrompt}
                      type="button"
                    >
                      Next sentence
                    </button>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      ) : practiceMode === 'quiz' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-bold text-sm">
              {quizIndex < vocabulary.length
                ? `Question ${quizIndex + 1} of ${vocabulary.length}`
                : 'Quiz Complete!'}
            </p>
            <button
              className="inline-flex items-center gap-2 border-2 border-border bg-background px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)]"
              onClick={resetPractice}
              type="button"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Review words
            </button>
          </div>

          {quizIndex < vocabulary.length ? (
            (() => {
              const entry = vocabulary[quizIndex];
              if (!entry) return null;
              return (
                <div className="space-y-6 border-2 border-border bg-background p-6 shadow-[4px_4px_0_var(--border)]">
                  {entry.imageUrl ? (
                    <div className="mx-auto flex max-w-md justify-center overflow-hidden border-2 border-border bg-muted/20 shadow-[2px_2px_0_var(--border)]">
                      <Image
                        alt="Quiz Clue"
                        className="max-h-64 w-full object-contain"
                        height={320}
                        unoptimized
                        referrerPolicy="no-referrer"
                        src={entry.imageUrl}
                        width={512}
                      />
                    </div>
                  ) : (
                    <div className="flex h-36 items-center justify-center border-2 border-border border-dashed bg-muted/10 text-muted-foreground text-xs">
                      No image clue available
                    </div>
                  )}

                  <div className="space-y-2 text-center">
                    {entry.pronunciation ? (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <p className="font-serif text-lg text-muted-foreground tracking-wide">
                          {entry.pronunciation}
                        </p>
                        {quizAnswered && (
                          <button
                            className="inline-flex items-center gap-1 rounded border-2 border-border bg-card px-2 py-0.5 font-bold text-xs shadow-[1.5px_1.5px_0_var(--border)] hover:bg-muted/30 disabled:opacity-50"
                            disabled={playingKey !== null}
                            onClick={() =>
                              playSpeech(
                                entry.word,
                                'word',
                                `${entry.id}-quiz-word`
                              )
                            }
                            type="button"
                          >
                            {playingKey === `${entry.id}-quiz-word`
                              ? 'Playing...'
                              : 'Play voice'}
                          </button>
                        )}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <p className="font-medium text-base italic leading-relaxed">
                        "{entry.definition}"
                      </p>
                      <button
                        className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-xs shadow-[1px_1px_0_var(--border)] hover:bg-muted/30 disabled:opacity-50"
                        disabled={playingKey !== null}
                        onClick={() =>
                          playSpeech(
                            entry.definition,
                            'example',
                            `${entry.id}-quiz-def`
                          )
                        }
                        type="button"
                      >
                        {playingKey === `${entry.id}-quiz-def`
                          ? 'Playing...'
                          : 'Play clue'}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {quizOptions.map((option) => {
                      const isCorrectOption = option === entry.word;
                      const isSelectedOption = option === quizSelectedOption;

                      let optionStyle =
                        'border-border bg-background shadow-[3px_3px_0_var(--border)] hover:bg-muted/30';
                      if (quizAnswered) {
                        if (isCorrectOption) {
                          optionStyle =
                            'border-dynamic-green/70 bg-dynamic-green/10 text-dynamic-green shadow-[3px_3px_0_var(--border)] font-bold';
                        } else if (isSelectedOption) {
                          optionStyle =
                            'border-destructive/70 bg-destructive/10 text-destructive shadow-[3px_3px_0_var(--border)] font-bold';
                        } else {
                          optionStyle =
                            'border-border bg-background/50 opacity-60 shadow-[1px_1px_0_var(--border)]';
                        }
                      }

                      return (
                        <button
                          key={option}
                          className={cn(
                            'min-h-16 border-2 px-4 text-left font-bold text-sm transition-all',
                            optionStyle
                          )}
                          disabled={quizAnswered}
                          onClick={() => selectQuizOption(option)}
                          type="button"
                        >
                          <span className="mb-1 block text-[10px] text-muted-foreground uppercase tracking-widest">
                            Choice
                          </span>
                          {option}
                        </button>
                      );
                    })}
                  </div>

                  {quizAnswered && (
                    <div className="flex justify-end pt-2">
                      <button
                        className="inline-flex items-center gap-2 border-2 border-border bg-primary px-5 py-2.5 font-black text-primary-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
                        onClick={nextQuizQuestion}
                        type="button"
                      >
                        {quizIndex + 1 === vocabulary.length
                          ? 'View Results'
                          : 'Next Question'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <div className="space-y-6 border-2 border-border bg-background p-8 text-center shadow-[4px_4px_0_var(--border)]">
              <div className="space-y-2">
                <h3 className="font-black text-2xl">Practice Complete!</h3>
                <p className="text-muted-foreground text-sm">
                  Here is how you performed on this quiz:
                </p>
              </div>

              <div className="inline-block min-w-[200px] border-2 border-border bg-card p-6 shadow-[3px_3px_0_var(--border)]">
                <p className="mb-1 font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
                  Score
                </p>
                <p className="font-black text-4xl text-primary">
                  {quizCorrectCount} / {vocabulary.length}
                </p>
                <p className="mt-2 text-muted-foreground text-xs">
                  {Math.round((quizCorrectCount / vocabulary.length) * 100)}%
                  Correct
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-3 pt-4">
                <button
                  className="border-2 border-border bg-primary px-5 py-2.5 font-black text-primary-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
                  onClick={() => startPractice('quiz')}
                  type="button"
                >
                  Try Again
                </button>
                <button
                  className="border-2 border-border bg-background px-5 py-2.5 font-black text-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
                  onClick={resetPractice}
                  type="button"
                >
                  Review Words
                </button>
              </div>
            </div>
          )}
        </div>
      ) : practiceMode === 'match' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-bold text-sm">
              {finished
                ? 'All matched!'
                : `${matchedIds.length / 2} / ${vocabulary.length} matched`}
            </p>
            <button
              className="inline-flex items-center gap-2 border-2 border-border bg-background px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)]"
              onClick={resetPractice}
              type="button"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Review words
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {cards.map((card) => {
              const isMatched = matchedSet.has(card.id);
              const isSelected = selected?.id === card.id;
              const isMismatch = mismatchIds.includes(card.id);

              return (
                <button
                  className={cn(
                    'min-h-24 border-2 border-border bg-background p-4 text-left font-bold text-sm shadow-[3px_3px_0_var(--border)] transition',
                    isSelected && 'bg-dynamic-cyan/15',
                    isMismatch && 'bg-destructive/10',
                    isMatched &&
                      'border-dynamic-green/70 bg-dynamic-green/10 text-dynamic-green'
                  )}
                  disabled={isMatched}
                  key={card.id}
                  onClick={() => selectCard(card)}
                  type="button"
                >
                  <span className="mb-2 block text-[10px] text-muted-foreground uppercase tracking-widest">
                    {card.side === 'word' ? 'Word' : 'Definition'}
                  </span>
                  <span className="flex items-start justify-between gap-2">
                    {card.label}
                    {isMatched ? <Check className="h-4 w-4 shrink-0" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </ContentCard>
  );
}
