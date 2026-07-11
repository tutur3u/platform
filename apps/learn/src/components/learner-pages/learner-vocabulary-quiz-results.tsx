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
    <div className="space-y-6 border-2 border-border bg-background p-8 text-center shadow-[4px_4px_0_var(--border)]">
      <div className="space-y-2">
        <h3 className="font-black text-2xl">{t('practiceComplete')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('quizResultDescription')}
        </p>
      </div>

      <div className="inline-block min-w-[200px] border-2 border-border bg-card p-6 shadow-[3px_3px_0_var(--border)]">
        <p className="mb-1 font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
          {t('score')}
        </p>
        <p className="font-black text-4xl text-primary">
          {correctCount} / {total}
        </p>
        <p className="mt-2 text-muted-foreground text-xs">
          {t('correctPercent', { percent })}
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3 pt-4">
        <button
          className="border-2 border-border bg-primary px-5 py-2.5 font-black text-primary-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
          onClick={restartQuiz}
          type="button"
        >
          {t('tryAgain')}
        </button>
        <button
          className="border-2 border-border bg-background px-5 py-2.5 font-black text-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
          onClick={resetPractice}
          type="button"
        >
          {t('reviewWords')}
        </button>
      </div>
    </div>
  );
}
