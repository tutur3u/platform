'use client';

import { ComparedDateRangePicker } from '@tuturuuu/ui/custom/compared-date-range-picker';
import { useQueryState } from 'nuqs';
import { useCallback } from 'react';

export function DateRangeFilterWrapper() {
  const [start, setStart] = useQueryState('start', { shallow: false });
  const [end, setEnd] = useQueryState('end', { shallow: false });
  const [, setPage] = useQueryState('page', { shallow: false });

  const handleDateRangeChange = useCallback(
    async (values: { range: { from: Date; to?: Date } }) => {
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
    />
  );
}
