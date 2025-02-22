'use client';

import { Calendar } from '@tuturuuu/ui/calendar';
import { enUS, vi } from 'date-fns/locale';
import { useLocale } from 'next-intl';
import React from 'react';

interface DateSelectorProps {
  value?: Date[];
  onSelect?: React.Dispatch<React.SetStateAction<Date[] | undefined>>;
}

export default function DateSelector({ value, onSelect }: DateSelectorProps) {
  const locale = useLocale();

  return (
    <Calendar
      mode="multiple"
      selected={value}
      onSelect={onSelect}
      className="rounded-md border"
      classNames={{
        row: 'flex justify-center gap-2',
        head_row: 'flex justify-center gap-2',
        tbody: 'grid gap-2',
      }}
      locale={locale === 'vi' ? vi : enUS}
    />
  );
}
