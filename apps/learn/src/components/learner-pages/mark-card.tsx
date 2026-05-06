'use client';

import { Trophy } from '@tuturuuu/icons';
import type { TulearnMarkSummary } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { courseThemes } from './shared';

export function MarkCard({
  index,
  mark,
}: {
  index: number;
  mark: TulearnMarkSummary;
}) {
  const t = useTranslations();
  const theme = courseThemes[index % courseThemes.length] ?? courseThemes[0];
  return (
    <article
      className={cn(
        'rounded-[2rem] border bg-card p-6 shadow-sm transition duration-200 hover:-translate-y-0.5',
        theme.border
      )}
      data-tulearn-reveal
    >
      <Trophy className={cn('mb-5 h-7 w-7', theme.text)} />
      <p className="text-muted-foreground text-sm">
        {mark.metric.name ?? t('marks.untitled')}
      </p>
      <p className="mt-2 font-bold text-4xl tracking-normal">
        {mark.value ?? '-'}
        {mark.metric.unit ? (
          <span className="ml-1 text-base text-muted-foreground">
            {mark.metric.unit}
          </span>
        ) : null}
      </p>
      {mark.course ? (
        <p className="mt-4 text-muted-foreground text-sm">
          {mark.course.name ?? t('courses.untitled')}
        </p>
      ) : null}
    </article>
  );
}
