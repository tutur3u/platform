'use client';

import { Calendar as CalendarIcon, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';

interface Props {
  defaultValue?: Date;
  value?: Date | null;
  onValueChange?: (date?: Date) => void;
  className?: string;
}

export function DatePicker({
  defaultValue,
  value,
  onValueChange,
  className,
}: Props) {
  const [date, setDate] = useState<Date | null | undefined>(defaultValue);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setDate(value);
  }, [value]);

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDate(undefined);
    onValueChange?.(undefined);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative w-full">
        <PopoverTrigger asChild>
          <Button
            variant={'outline'}
            className={cn(
              'w-full justify-start text-left font-normal',
              !date && 'text-muted-foreground',
              className
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, 'PPP') : <span>Pick a date</span>}
          </Button>
        </PopoverTrigger>
        {date && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm opacity-50 hover:opacity-100 focus:outline-none"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date || undefined}
          onSelect={(date) => {
            setDate(date);
            onValueChange?.(date);
          }}
          onSubmit={(date) => {
            setDate(date);
            onValueChange?.(date);
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
