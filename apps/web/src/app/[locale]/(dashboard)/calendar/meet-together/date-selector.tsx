import { Calendar } from '@repo/ui/components/ui/calendar';
import { enUS, vi } from 'date-fns/locale';
import useTranslation from 'next-translate/useTranslation';
import React from 'react';

interface DateSelectorProps {
  value?: Date[];
  onSelect?: React.Dispatch<React.SetStateAction<Date[] | undefined>>;
}

export default function DateSelector({ value, onSelect }: DateSelectorProps) {
  const { lang } = useTranslation();
  return (
    <Calendar
      mode="multiple"
      selected={value}
      onSelect={onSelect}
      className="rounded-md border"
      classNames={{
        row: 'flex justify-center gap-2 md:gap-1',
        head_row: 'flex justify-center gap-2 md:gap-1',
        tbody: 'grid gap-2 md:gap-1',
      }}
      locale={lang === 'vi' ? vi : enUS}
    />
  );
}
