'use client';

import { BookOpen, Check, RotateCcw, Sparkles } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
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
  const [practiceMode, setPracticeMode] = useState<'match' | 'quiz' | null>(
    null
  );
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [quizSelectedOption, setQuizSelectedOption] = useState<string | null>(
    null
  );
  const [quizCorrectCount, setQuizCorrectCount] = useState(0);
  const [quizAnswered, setQuizAnswered] = useState(false);

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

  function startPractice(mode: 'match' | 'quiz') {
    setPracticeMode(mode);
    if (mode === 'match') {
      setCards(buildCards(vocabulary));
      setMatchedIds([]);
      setMismatchIds([]);
      setSelected(null);
    } else {
      setQuizIndex(0);
      setQuizCorrectCount(0);
      setQuizSelectedOption(null);
      setQuizAnswered(false);
      generateQuizOptions(0, vocabulary);
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

  function resetPractice() {
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
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {vocabulary.map((entry) => (
              <article
                className="border-2 border-border bg-background p-4 shadow-[3px_3px_0_var(--border)]"
                key={entry.id}
              >
                {entry.imageUrl ? (
                  <img
                    alt={`${entry.word} vocabulary`}
                    className="mb-4 aspect-video w-full border-2 border-border object-cover shadow-[3px_3px_0_var(--border)]"
                    src={entry.imageUrl}
                    referrerPolicy="no-referrer"
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
                      <img
                        alt="Quiz Clue"
                        className="max-h-64 w-full object-contain"
                        src={entry.imageUrl}
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : (
                    <div className="flex h-36 items-center justify-center border-2 border-border border-dashed bg-muted/10 text-muted-foreground text-xs">
                      No image clue available
                    </div>
                  )}

                  <div className="text-center space-y-2">
                    {entry.pronunciation ? (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <p className="font-serif text-lg text-muted-foreground tracking-wide">
                          {entry.pronunciation}
                        </p>
                        {quizAnswered && (
                          <button
                            className="inline-flex items-center gap-1 rounded border-2 border-border bg-card px-2 py-0.5 font-bold text-xs shadow-[1.5px_1.5px_0_var(--border)] disabled:opacity-50 hover:bg-muted/30"
                            disabled={playingKey !== null}
                            onClick={() =>
                              playSpeech(entry.word, 'word', `${entry.id}-quiz-word`)
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
                      <p className="text-base italic leading-relaxed font-medium">
                        "{entry.definition}"
                      </p>
                      <button
                        className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-xs shadow-[1px_1px_0_var(--border)] disabled:opacity-50 hover:bg-muted/30"
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
