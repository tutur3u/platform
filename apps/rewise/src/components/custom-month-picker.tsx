'use client';

import MonthPicker from '@tuturuuu/ui/custom/month-picker';
import useSearchParams from '@/hooks/useSearchParams';

interface MonthPickerProps {
  lang: string;
  resetPage?: boolean;
  className?: string;
  defaultMonth?: string;
  onUpdate?: (
    args: {
      month: string;
      page?: string;
    },
    refresh: boolean
  ) => void;
}

type CustomMonthPickerProps = Omit<
  MonthPickerProps,
  'defaultMonth' | 'onUpdate'
> & {
  lang?: string;
};

export const CustomMonthPicker = ({
  lang = 'en',
  ...props
}: CustomMonthPickerProps) => {
  const searchParams = useSearchParams();

  const monthParam = searchParams.get('month');
  const defaultMonth = Array.isArray(monthParam) ? monthParam[0] : monthParam;

  return (
    <MonthPicker
      lang={lang}
      defaultMonth={defaultMonth || undefined}
      onUpdate={({ month, page }, refresh) => {
        searchParams.set({ month, page }, refresh);
      }}
      {...props}
    />
  );
};
