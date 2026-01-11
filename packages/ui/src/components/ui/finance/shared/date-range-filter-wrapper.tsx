'use client';

import { ComparedDateRangePicker } from '@tuturuuu/ui/custom/compared-date-range-picker';
import { vi } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';
import { useQueryState } from 'nuqs';
import { useCallback } from 'react';

export function DateRangeFilterWrapper() {
  const t = useTranslations();
  const locale = useLocale();
  const [start, setStart] = useQueryState('start', { shallow: false });
  const [end, setEnd] = useQueryState('end', { shallow: false });
  const [, setPage] = useQueryState('page', { shallow: false });

  const handleDateRangeChange = useCallback(
    async (values: {
      range: { from: Date | undefined; to?: Date | undefined };
    }) => {
      if (values.range.from) {
        const from = new Date(values.range.from);
        from.setHours(0, 0, 0, 0);
        await setStart(from.toISOString());
      } else {
        await setStart(null);
      }

      if (values.range.to) {
        const to = new Date(values.range.to);
        to.setHours(23, 59, 59, 999);
        await setEnd(to.toISOString());
      } else {
        await setEnd(null);
      }

      // Reset to first page when filtering
      await setPage('1');
    },
    [setStart, setEnd, setPage]
  );

  return (
    <ComparedDateRangePicker
      initialDateFrom={start ? new Date(start) : undefined}
      initialDateTo={end ? new Date(end) : undefined}
      showCompare={false}
      onUpdate={handleDateRangeChange}
      className="h-8 w-fit"
      locale={locale === 'vi' ? vi : locale}
      labels={{
        allDates: t('date_range.all_dates'),
        compare: t('date_range.compare'),
        vs: t('date_range.vs'),
        cancel: t('date_range.cancel'),
        update: t('date_range.update'),
        clear: t('date_range.clear'),
        presetsTitle: t('date_range.presets'),
        presets: {
          today: t('date_range.today'),
          yesterday: t('date_range.yesterday'),
          last7: t('date_range.last_7_days'),
          last14: t('date_range.last_14_days'),
          last30: t('date_range.last_30_days'),
          thisWeek: t('date_range.this_week'),
          lastWeek: t('date_range.last_week'),
          thisMonth: t('date_range.this_month'),
          lastMonth: t('date_range.last_month'),
        },
      }}
    />
  );
}
