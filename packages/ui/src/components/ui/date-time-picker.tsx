'use client';

import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { CalendarIcon, Clock } from 'lucide-react';
import { useState } from 'react';

interface DateTimePickerProps {
  date?: Date;
  setDate: (date: Date) => void;
  showTimeSelect?: boolean;
}

export function DateTimePicker({
  date,
  setDate,
  showTimeSelect = true,
}: DateTimePickerProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(date);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const handleSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) return;

    // Preserve the time if the date already exists
    if (date) {
      selectedDate.setHours(date.getHours());
      selectedDate.setMinutes(date.getMinutes());
    }

    setSelectedDate(selectedDate);
    setDate(selectedDate);
    setIsCalendarOpen(false);
  };

  const handleHourChange = (hour: string) => {
    if (!selectedDate) return;

    const newDate = new Date(selectedDate);
    newDate.setHours(parseInt(hour, 10));
    setSelectedDate(newDate);
    setDate(newDate);
  };

  const handleMinuteChange = (minute: string) => {
    if (!selectedDate) return;

    const newDate = new Date(selectedDate);
    newDate.setMinutes(parseInt(minute, 10));
    setSelectedDate(newDate);
    setDate(newDate);
  };

  // Generate hour and minute options
  const hours = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0');
    return { value: hour, label: hour };
  });

  const minutes = Array.from({ length: 12 }, (_, i) => {
    const minute = (i * 5).toString().padStart(2, '0');
    return { value: minute, label: minute };
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal',
                !date && 'text-muted-foreground'
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
              onSelect={handleSelect}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {showTimeSelect && (
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Select
              value={date ? format(date, 'HH') : undefined}
              onValueChange={handleHourChange}
            >
              <SelectTrigger className="w-[70px]">
                <SelectValue placeholder="Hour" />
              </SelectTrigger>
              <SelectContent>
                {hours.map((hour) => (
                  <SelectItem key={hour.value} value={hour.value}>
                    {hour.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">:</span>
            <Select
              value={date ? format(date, 'mm') : undefined}
              onValueChange={handleMinuteChange}
            >
              <SelectTrigger className="w-[70px]">
                <SelectValue placeholder="Min" />
              </SelectTrigger>
              <SelectContent>
                {minutes.map((minute) => (
                  <SelectItem key={minute.value} value={minute.value}>
                    {minute.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
