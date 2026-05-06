'use client';

import { Trophy } from '@tuturuuu/icons';
import type { TulearnMarkSummary } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { BrutalCard, BrutalIcon, courseThemes } from './shared';

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
    <BrutalCard
      className={cn(
        'p-6',
        index % 2 === 0 ? 'bg-card' : 'bg-dynamic-yellow/10'
      )}
    >
      <BrutalIcon className={cn('mb-5', theme.text)} icon={Trophy} />
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
    </BrutalCard>
  );
}
