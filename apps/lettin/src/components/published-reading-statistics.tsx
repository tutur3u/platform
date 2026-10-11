'use client';
import type { LettinNode } from '@tuturuuu/internal-api/lettin';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { documentWritingStatistics } from './writing-statistics-model';

export function PublishedReadingStatistics({
  content,
}: {
  content: LettinNode;
}) {
  const t = useTranslations('lettin');
  const counts = useMemo(() => documentWritingStatistics(content), [content]);
  return (
    <section
      aria-label={t('publishedReadingStatistics')}
      className="my-4 space-y-1 text-sm"
    >
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
        {t('publishedReadingStatisticsHint')}
      </p>
      {counts.truncated && (
        <p className="text-xs">{t('writingStatisticsPartial')}</p>
      )}
    </section>
  );
}
