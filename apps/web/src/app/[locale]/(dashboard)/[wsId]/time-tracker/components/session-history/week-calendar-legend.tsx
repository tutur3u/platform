'use client';

import type { TimeTrackingCategory } from '@tuturuuu/types';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { getAccentBgClass } from './week-calendar-utils';

interface WeekCalendarLegendProps {
  categories: TimeTrackingCategory[] | null;
}

export function WeekCalendarLegend({ categories }: WeekCalendarLegendProps) {
  const t = useTranslations('time-tracker.session_history');

  if (!categories || categories.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
      <span className="font-medium">{t('category_legend')}:</span>
      {categories.map((cat) => (
        <span key={cat.id} className="flex items-center gap-1.5">
          <span
            className={cn(
              'inline-block h-2.5 w-2.5 rounded-full',
              getAccentBgClass(cat.color)
            )}
          />
          {cat.name}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            'inline-block h-2.5 w-2.5 rounded-full',
            getAccentBgClass('GRAY')
          )}
        />
        {t('uncategorized')}
      </span>
    </div>
  );
}
