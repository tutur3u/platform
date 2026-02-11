'use client';

import { Calendar } from '@tuturuuu/ui/calendar';
import { cn } from '@tuturuuu/utils/format';
import { enUS, vi } from 'date-fns/locale';
import { useLocale } from 'next-intl';
import type React from 'react';

interface DateSelectorProps {
  value?: Date[];
  onSelect?: React.Dispatch<React.SetStateAction<Date[] | undefined>>;
  className?: string;
}

export default function DateSelector({
  value,
  onSelect,
  className,
}: DateSelectorProps) {
  const locale = useLocale();

  return (
    <div className="w-full max-w-[calc(100vw-2rem)] overflow-hidden">
      <Calendar
        mode="multiple"
        selected={value}
        onSelect={onSelect}
        className={cn('mx-auto rounded-md border', className)}
        classNames={{
          root: 'w-full max-w-full',
          months: 'flex flex-col items-center',
          month:
            'space-y-4 min-w-[280px] max-w-full text-center p-2 font-semibold w-full sm:min-w-[300px]',
          row: 'flex justify-center gap-1 sm:gap-2',
          head_row: 'flex justify-center gap-1 sm:gap-2',
          tbody: 'grid gap-2',
          day: 'text-center text-sm p-0 relative w-8 h-8 sm:w-9 sm:h-9',
          day_button:
            'h-full w-full rounded-md p-0 font-normal transition-colors duration-300',
        }}
        locale={locale === 'vi' ? vi : enUS}
        minDate={new Date()}
      />
    </div>
  );
}
