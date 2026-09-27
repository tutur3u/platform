'use client';

import { useTranslations } from 'next-intl';

interface Props {
  correctCount: number;
  resetPractice: () => void;
  restartQuiz: () => void;
  total: number;
}

export function LearnerVocabularyQuizResults({
  correctCount,
  resetPractice,
  restartQuiz,
  total,
}: Props) {
  const t = useTranslations('learnerVocabulary');
  const percent = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  return (
    <div className="space-y-6 rounded-lg border border-border bg-background p-8 text-center">
      <div className="space-y-2">
        <h3 className="font-semibold text-2xl">{t('practiceComplete')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('quizResultDescription')}
        </p>
      </div>

      <div className="inline-block min-w-[200px] rounded-lg border border-border bg-card p-6">
        <p className="mb-1 font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
          {t('score')}
        </p>
        <p className="font-semibold text-4xl text-primary">
          {correctCount} / {total}
        </p>
        <p className="mt-2 text-muted-foreground text-xs">
          {t('correctPercent', { percent })}
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3 pt-4">
        <button
          className="rounded-lg border border-border bg-primary px-5 py-2.5 font-semibold text-primary-foreground text-sm transition"
          onClick={restartQuiz}
          type="button"
        >
          {t('tryAgain')}
        </button>
        <button
          className="rounded-lg border border-border bg-background px-5 py-2.5 font-semibold text-foreground text-sm transition"
          onClick={resetPractice}
          type="button"
        >
          {t('reviewWords')}
        </button>
      </div>
    </div>
  );
}
