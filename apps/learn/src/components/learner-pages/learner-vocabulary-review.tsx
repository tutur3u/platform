'use client';

import { Sparkles } from '@tuturuuu/icons';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { VocabularyEntry } from './learner-vocabulary-utils';

interface Props {
  playSpeech: (
    text: string,
    kind: 'example' | 'word',
    key: string
  ) => Promise<void>;
  playingKey: string | null;
  startPractice: (mode: 'match' | 'pronunciation' | 'quiz') => void;
  vocabulary: VocabularyEntry[];
}

export function LearnerVocabularyReview({
  playSpeech,
  playingKey,
  startPractice,
  vocabulary,
}: Props) {
  const t = useTranslations('learnerVocabulary');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-border bg-background p-4 shadow-[3px_3px_0_var(--border)]">
        <div>
          <p className="font-black text-base">{t('reviewTitle')}</p>
          <p className="text-muted-foreground text-sm">
            {t('reviewDescription')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-2 border-2 border-border bg-primary px-4 py-2 font-black text-primary-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={vocabulary.length < 2}
            onClick={() => startPractice('match')}
            title={vocabulary.length < 2 ? t('practiceRequiresTwo') : undefined}
            type="button"
          >
            {t('practiceMatch')}
          </button>
          <button
            className="inline-flex items-center gap-2 border-2 border-border bg-dynamic-cyan px-4 py-2 font-black text-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={vocabulary.length < 2}
            onClick={() => startPractice('quiz')}
            title={vocabulary.length < 2 ? t('practiceRequiresTwo') : undefined}
            type="button"
          >
            {t('practiceQuiz')}
          </button>
          <button
            className="inline-flex items-center gap-2 border-2 border-border bg-dynamic-yellow px-4 py-2 font-black text-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
            onClick={() => startPractice('pronunciation')}
            type="button"
          >
            {t('practicePronunciation')}
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
                alt={t('imageAlt', { word: entry.word })}
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
              aria-label={t('playWordLabel', { word: entry.word })}
              className="mt-3 border-2 border-border bg-card px-3 py-1.5 font-bold text-xs shadow-[2px_2px_0_var(--border)] disabled:opacity-50"
              disabled={playingKey !== null}
              onClick={() => playSpeech(entry.word, 'word', `${entry.id}-word`)}
              type="button"
            >
              {playingKey === `${entry.id}-word` ? t('playing') : t('playWord')}
            </button>
            <p className="mt-3 text-sm leading-relaxed">{entry.definition}</p>
            {entry.examples.length > 0 ? (
              <ul className="mt-3 space-y-2 text-muted-foreground text-xs">
                {entry.examples.map((example, index) => {
                  const speechKey = `${entry.id}-example-${index}`;
                  return (
                    <li
                      className="flex flex-wrap items-center gap-2"
                      key={speechKey}
                    >
                      <span>{example}</span>
                      <button
                        aria-label={t('playExampleLabel', {
                          example,
                          word: entry.word,
                        })}
                        className="border border-border bg-card px-2 py-0.5 font-bold text-[10px] text-foreground shadow-[1px_1px_0_var(--border)] disabled:opacity-50"
                        disabled={playingKey !== null}
                        onClick={() =>
                          playSpeech(example, 'example', speechKey)
                        }
                        type="button"
                      >
                        {playingKey === speechKey
                          ? t('playing')
                          : t('playExample')}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
