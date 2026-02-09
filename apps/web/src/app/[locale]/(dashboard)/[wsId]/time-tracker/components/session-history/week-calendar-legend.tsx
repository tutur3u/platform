'use client';

import type { TimeTrackingCategory } from '@tuturuuu/types';
import { computeAccessibleLabelStyles } from '@tuturuuu/utils/label-colors';
import { useTranslations } from 'next-intl';

interface WeekCalendarLegendProps {
  categories: TimeTrackingCategory[] | null;
}

export function WeekCalendarLegend({ categories }: WeekCalendarLegendProps) {
  const t = useTranslations('time-tracker.session_history');

  if (!categories || categories.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
      <span className="font-medium">{t('category_legend')}:</span>
      {categories.map((cat) => {
        const catStyles = computeAccessibleLabelStyles(cat.color || 'GRAY');
        return (
          <span key={cat.id} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: catStyles?.text }}
            />
            {cat.name}
          </span>
        );
      })}
      {(() => {
        const catStyles = computeAccessibleLabelStyles('GRAY');
        return (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: catStyles?.text }}
            />
            {t('uncategorized')}
          </span>
        );
      })()}
    </div>
  );
}
