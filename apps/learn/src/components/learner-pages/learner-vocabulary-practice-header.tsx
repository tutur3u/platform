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
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 font-bold text-sm"
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
      <div className="h-20 animate-pulse rounded-lg border border-border bg-muted/60 motion-reduce:animate-none" />
      <div className="h-20 animate-pulse rounded-lg border border-border bg-muted/60 motion-reduce:animate-none" />
    </div>
  );
}
