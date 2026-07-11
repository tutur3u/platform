'use client';

import { useTranslations } from 'next-intl';
import {
  type PronunciationFeedback,
  sentenceParts,
} from './learner-vocabulary-utils';

export function LearnerVocabularyPronunciationFeedback({
  feedback,
  sentence,
}: {
  feedback: PronunciationFeedback;
  sentence: string;
}) {
  const t = useTranslations('learnerVocabulary');

  return (
    <div className="space-y-4 border-2 border-border bg-card p-4 shadow-[3px_3px_0_var(--border)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-black text-base">{t('feedbackTitle')}</p>
          <p className="text-muted-foreground text-sm">{feedback.summary}</p>
        </div>
        {typeof feedback.score === 'number' ? (
          <div className="border-2 border-border bg-background px-3 py-2 text-center shadow-[2px_2px_0_var(--border)]">
            <p className="font-black text-xl">{feedback.score}/100</p>
          </div>
        ) : null}
      </div>

      {feedback.transcript ? (
        <p className="text-sm">
          <span className="font-bold">{t('heard')}</span> {feedback.transcript}
        </p>
      ) : null}

      {feedback.mistakes?.length ? (
        <div className="space-y-3">
          <div className="border-2 border-dynamic-yellow/50 bg-dynamic-yellow/10 p-3 shadow-[2px_2px_0_var(--border)]">
            <p className="mb-2 font-bold text-xs uppercase tracking-widest">
              {t('sentenceMap')}
            </p>
            <p className="text-base leading-relaxed">
              {sentenceParts(sentence, feedback.mistakes).map((part, index) =>
                part.isMistake ? (
                  <mark
                    className="border-2 border-dynamic-yellow bg-dynamic-yellow px-1 font-black text-black shadow-[1px_1px_0_var(--border)]"
                    key={`${part.text}-${index}`}
                  >
                    {part.text}
                  </mark>
                ) : (
                  <span key={`${part.text}-${index}`}>{part.text}</span>
                )
              )}
            </p>
          </div>

          <div>
            <p className="mb-2 font-bold text-xs uppercase tracking-widest">
              {t('partsToPractice')}
            </p>
            <ul className="space-y-2 text-sm">
              {feedback.mistakes.map((mistake, index) => (
                <li
                  className="border border-border bg-background p-3"
                  key={`${mistake.target}-${index}`}
                >
                  <p>
                    <span className="font-bold">{t('target')}</span>{' '}
                    {mistake.target}
                    {mistake.heard ? (
                      <>
                        {' '}
                        <span className="text-muted-foreground">
                          {t('soundedLike')}
                        </span>{' '}
                        {mistake.heard}
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1 text-muted-foreground">{mistake.issue}</p>
                  {mistake.suggestion ? (
                    <p className="mt-1 font-bold">
                      {t('trySuggestion', {
                        suggestion: mistake.suggestion,
                      })}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {feedback.issues.length > 0 ? (
        <div>
          <p className="mb-2 font-bold text-xs uppercase tracking-widest">
            {t('whatToFix')}
          </p>
          <ul className="space-y-1 text-sm">
            {feedback.issues.map((issue) => (
              <li key={issue}>- {issue}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {feedback.tips.length > 0 ? (
        <div>
          <p className="mb-2 font-bold text-xs uppercase tracking-widest">
            {t('practiceTips')}
          </p>
          <ul className="space-y-1 text-sm">
            {feedback.tips.map((tip) => (
              <li key={tip}>- {tip}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
