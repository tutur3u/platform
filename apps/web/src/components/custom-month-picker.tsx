'use client';

import MonthPicker from '@tuturuuu/ui/custom/month-picker';
import useSearchParams from '@/hooks/useSearchParams';

interface CustomMonthPickerProps {
  className?: string;
  [key: string]: unknown;
}

export const CustomMonthPicker = ({ ...props }: CustomMonthPickerProps) => {
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
