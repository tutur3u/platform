'use client';

import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import { CalendarIcon } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useState } from 'react';

interface DateTimePickerProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function DateTimePicker({
  value,
  onChange,
  disabled = false,
  placeholder = 'Select date and time',
}: DateTimePickerProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Format time as HH:MM
  const formatTimeForInput = (date: Date | null) => {
    if (!date) return '';
    return format(date, 'HH:mm');
  };

  // Handle time input change
  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!value) return;

    const timeString = e.target.value;
    if (!timeString) return;

    const [hoursStr, minutesStr] = timeString.split(':');
    if (!hoursStr || !minutesStr) return;

    const hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);

    if (isNaN(hours) || isNaN(minutes)) return;

    const newDate = new Date(value);
    newDate.setHours(hours);
    newDate.setMinutes(minutes);

    onChange(newDate);
  };

  // Handle date selection
  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      onChange(null);
      return;
    }

    // If we already have a value, preserve the time
    if (value) {
      const newDate = new Date(date);
      newDate.setHours(value.getHours());
      newDate.setMinutes(value.getMinutes());
      onChange(newDate);
    } else {
      // Default to noon if no previous value
      const newDate = new Date(date);
      newDate.setHours(12);
      newDate.setMinutes(0);
      onChange(newDate);
    }

    setIsCalendarOpen(false);
  };

  // Handle clearing the date
  const handleClear = () => {
    onChange(null);
    setIsCalendarOpen(false);
  };

  return (
    <div className="flex gap-2">
      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'flex w-full justify-start text-left font-normal',
              !value && 'text-muted-foreground'
            )}
            disabled={disabled}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(value, 'PPP') : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value || undefined}
            onSelect={handleDateSelect}
            className="rounded-md border shadow"
          />
          <div className="flex items-center justify-between border-t p-3">
            <Button variant="ghost" size="sm" onClick={handleClear}>
              Clear
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCalendarOpen(false)}
            >
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <div className="relative">
        <Input
          type="time"
          value={formatTimeForInput(value)}
          onChange={handleTimeChange}
          className={cn('w-[120px]', !value && 'bg-muted')}
          disabled={disabled || !value}
          placeholder="--:--"
        />
      </div>
    </div>
  );
}
