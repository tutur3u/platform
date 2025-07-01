'use client';

import { Button } from '@ncthub/ui/button';
import { Calendar } from '@ncthub/ui/calendar';
import { CalendarIcon } from '@ncthub/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@ncthub/ui/popover';
import { cn } from '@ncthub/utils/format';
import { format } from 'date-fns';
import { Dispatch, SetStateAction } from 'react';

interface DatePickerProps {
  date: Date | null;
  setDate: Dispatch<SetStateAction<Date | null>>;
  placeholder?: string;
}

export function DatePicker({
  date,
  setDate,
  placeholder = 'Pick a date',
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={'outline'}
          className={cn(
            'w-[240px] justify-start text-left font-normal',
            !date && 'text-muted-foreground'
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, 'PPP') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date || undefined}
          onSelect={(date: Date | undefined) => setDate(date || null)}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
