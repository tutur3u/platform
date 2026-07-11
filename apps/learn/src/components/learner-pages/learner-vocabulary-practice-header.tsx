'use client';

import { RotateCcw } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';

export function LearnerVocabularyPracticeHeader({
  label,
  resetPractice,
}: {
  label: string;
  resetPractice: () => void;
}) {
  const t = useTranslations('learnerVocabulary');

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="font-bold text-sm">{label}</p>
      <button
        className="inline-flex items-center gap-2 border-2 border-border bg-background px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)]"
        onClick={resetPractice}
        type="button"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {t('reviewWords')}
      </button>
    </div>
  );
}

export function LearnerVocabularyLoading() {
  return (
    <div className="space-y-3">
      <div className="h-20 animate-pulse border-2 border-border bg-muted/60 shadow-[3px_3px_0_var(--border)] motion-reduce:animate-none" />
      <div className="h-20 animate-pulse border-2 border-border bg-muted/60 shadow-[3px_3px_0_var(--border)] motion-reduce:animate-none" />
    </div>
  );
}
