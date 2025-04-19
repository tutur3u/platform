'use client';

import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { format, parse } from 'date-fns';
import { CalendarIcon, Check, Clock, Edit } from 'lucide-react';
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
  const [isManualTimeEntry, setIsManualTimeEntry] = useState(false);
  const [manualTimeInput, setManualTimeInput] = useState(
    date ? format(date, 'HH:mm') : ''
  );

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

  const handleTimeChange = (timeString: string) => {
    if (!selectedDate) return;

    // Parse the time string (format: "HH:MM")
    const parts = timeString.split(':');
    if (parts.length !== 2) return;

    const hourStr = parts[0];
    const minuteStr = parts[1];

    if (!hourStr || !minuteStr) return;

    const hours = parseInt(hourStr, 10);
    const minutes = parseInt(minuteStr, 10);

    if (isNaN(hours) || isNaN(minutes)) return;

    const newDate = new Date(selectedDate);
    newDate.setHours(hours);
    newDate.setMinutes(minutes);

    setSelectedDate(newDate);
    setDate(newDate);
  };

  const handleManualTimeSubmit = () => {
    try {
      // Validate time format (HH:MM)
      if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(manualTimeInput)) {
        handleTimeChange(manualTimeInput);
        setIsManualTimeEntry(false);
      }
    } catch (error) {
      console.error('Invalid time format', error);
    }
  };

  // Generate time options in 15-minute increments
  const timeOptions = Array.from({ length: 24 * 4 }, (_, i) => {
    const hour = Math.floor(i / 4);
    const minute = (i % 4) * 15;
    const formattedHour = hour.toString().padStart(2, '0');
    const formattedMinute = minute.toString().padStart(2, '0');
    const value = `${formattedHour}:${formattedMinute}`;

    // Format for display (12-hour format with AM/PM)
    const display = format(parse(value, 'HH:mm', new Date()), 'h:mm a');

    return { value, display };
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
          <div className="flex items-center gap-2">
            <Clock className="text-muted-foreground h-4 w-4" />

            {isManualTimeEntry ? (
              <div className="flex items-center gap-1">
                <Input
                  value={manualTimeInput}
                  onChange={(e) => setManualTimeInput(e.target.value)}
                  placeholder="HH:MM"
                  className="w-[90px]"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleManualTimeSubmit}
                  className="h-8 w-8"
                >
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <Select
                  value={
                    date
                      ? `${format(date, 'HH')}:${format(date, 'mm')}`
                      : undefined
                  }
                  onValueChange={handleTimeChange}
                >
                  <SelectTrigger className="w-[110px]">
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {timeOptions.map((time) => (
                      <SelectItem key={time.value} value={time.value}>
                        {time.display}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setIsManualTimeEntry(true)}
                  className="h-8 w-8"
                  title="Enter time manually"
                >
                  <Edit className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
