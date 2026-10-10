'use client';
import type { LettinNode } from '@tuturuuu/internal-api/lettin';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { WritingGoal } from './writing-goal';
import { documentWritingStatistics } from './writing-statistics-model';

export function WritingStatistics({
  content,
  sourcePending,
}: {
  content: LettinNode;
  sourcePending: boolean;
}) {
  const t = useTranslations('lettin');
  const counts = useMemo(() => documentWritingStatistics(content), [content]);
  return (
    <section aria-label={t('writingStatistics')} className="space-y-2 text-sm">
      <dl className="flex flex-wrap gap-6">
        <div>
          <dt className="text-muted-foreground">{t('writingWords')}</dt>
          <dd>{t('writingCount', { count: counts.words })}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('writingCharacters')}</dt>
          <dd>{t('writingCount', { count: counts.characters })}</dd>
        </div>
      </dl>
      <p className="text-muted-foreground text-xs">
        {t(sourcePending ? 'writingSourcePending' : 'writingStatisticsHint')}
      </p>
      <WritingGoal
        words={counts.words}
        incomplete={sourcePending || counts.truncated}
      />
      {counts.truncated && (
        <p className="text-xs">{t('writingStatisticsPartial')}</p>
      )}
    </section>
  );
}
