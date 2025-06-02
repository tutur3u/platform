'use client';

import useSearchParams from '@/hooks/useSearchParams';
import MonthPicker from '@tuturuuu/ui/custom/month-picker';

export const CustomMonthPicker = ({ ...props }: any) => {
  const searchParams = useSearchParams();

  return (
    <MonthPicker
      defaultMonth={searchParams.get('month')}
      onUpdate={({ month, page }, refresh) => {
        searchParams.set({ month, page }, refresh);
      }}
      {...props}
    />
  );
};
