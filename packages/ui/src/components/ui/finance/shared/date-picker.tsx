import { Calendar as CalendarIcon } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '../../../ui/button';
import { Calendar } from '../../../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/popover';

interface Props {
  defaultValue?: Date;
  onValueChange: (date?: Date) => void;
  fromDate?: Date;
  toDate?: Date;
  className?: string;
  preferences?: {
    weekStartsOn?: 0 | 1 | 6;
    timezone?: string;
  };
}

export function DatePicker({
  defaultValue,
  onValueChange,
  className,
  fromDate,
  toDate,
  preferences,
}: Props) {
  const locale = useLocale();
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const dateLocale = locale.startsWith('vi') ? vi : enUS;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={'outline'}
          className={cn(
            'w-full justify-start text-left font-normal md:w-70',
            !defaultValue && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {defaultValue ? (
            format(defaultValue, 'PPP', { locale: dateLocale })
          ) : (
            <span>{t('common.pick_a_date')}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={defaultValue}
          onSelect={(date) => {
            onValueChange(date);
          }}
          onSubmit={(date) => {
            onValueChange(date);
          }}
          fromDate={fromDate}
          toDate={toDate}
          preferences={preferences}
          locale={dateLocale}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
