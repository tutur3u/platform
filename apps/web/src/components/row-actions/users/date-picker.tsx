'use client';

import { Button } from '@repo/ui/components/ui/button';
import { Calendar } from '@repo/ui/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@repo/ui/components/ui/popover';
import { cn } from '@repo/ui/lib/utils';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useState } from 'react';

interface Props {
  defaultValue?: Date;
  onValueChange?: (date?: Date) => void;
  className?: string;
}

export function DatePicker({ defaultValue, onValueChange, className }: Props) {
  const [date, setDate] = useState<Date | undefined>(defaultValue);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={'outline'}
          className={cn(
            'w-[280px] justify-start text-left font-normal',
            !date && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, 'PPP') : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(date) => {
            setDate(date);
            onValueChange?.(date);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
