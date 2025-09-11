'use client';

import MonthPicker from '@tuturuuu/ui/custom/month-picker';
import useSearchParams from '@/hooks/useSearchParams';

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
