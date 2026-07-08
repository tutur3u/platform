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
              .filter((example): example is string => typeof example === 'string')
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

  function startPractice() {
    setCards(buildCards(vocabulary));
    setMatchedIds([]);
    setMismatchIds([]);
    setSelected(null);
    setStarted(true);
  }

  async function playSpeech(text: string, kind: 'example' | 'word', key: string) {
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
    setCards([]);
    setMatchedIds([]);
    setMismatchIds([]);
    setSelected(null);
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
            <button
              className="inline-flex items-center gap-2 border-2 border-border bg-primary px-4 py-2 font-black text-primary-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
              onClick={startPractice}
              type="button"
            >
              Start
            </button>
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
                  onClick={() => playSpeech(entry.word, 'word', `${entry.id}-word`)}
                  type="button"
                >
                  {playingKey === `${entry.id}-word` ? 'Playing...' : 'Play word'}
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
      ) : (
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
                  <span className="mb-2 block text-muted-foreground text-[10px] uppercase tracking-widest">
                    {card.side === 'word' ? 'Word' : 'Definition'}
                  </span>
                  <span className="flex items-start justify-between gap-2">
                    {card.label}
                    {isMatched ? (
                      <Check className="h-4 w-4 shrink-0" />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </ContentCard>
  );
}
