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
import { useEffect, useRef, useState } from 'react';

interface DateTimePickerProps {
  date?: Date;
  setDate: (date: Date) => void;
  showTimeSelect?: boolean;
  minDate?: Date;
  minTime?: string;
  scrollIntoViewOnOpen?: boolean;
  pickerButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

// Utility to find the nearest scrollable parent
function getScrollableParent(node: HTMLElement | null): HTMLElement | null {
  if (!node) return null;
  let parent = node.parentElement;
  while (parent) {
    const style = window.getComputedStyle(parent);
    if (
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

export function DateTimePicker({
  date,
  setDate,
  showTimeSelect = true,
  minDate,
  minTime,
  scrollIntoViewOnOpen = false,
  pickerButtonRef,
}: DateTimePickerProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(date);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isManualTimeEntry, setIsManualTimeEntry] = useState(false);
  const [manualTimeInput, setManualTimeInput] = useState(
    date ? format(date, 'HH:mm') : ''
  );
  const popoverRef = useRef<HTMLDivElement>(null);

  // Keep manualTimeInput in sync with date prop
  useEffect(() => {
    setManualTimeInput(date ? format(date, 'HH:mm') : '');
  }, [date]);

  // Enhanced auto-scroll logic
  useEffect(() => {
    if (isCalendarOpen && scrollIntoViewOnOpen && pickerButtonRef?.current) {
      const button = pickerButtonRef.current;
      const scrollParent = getScrollableParent(button);

      if (scrollParent) {
        const buttonRect = button.getBoundingClientRect();
        const parentRect = scrollParent.getBoundingClientRect();
        const estimatedPopoverHeight = 350; // px, adjust if your popover is taller/shorter
        const padding = 16; // px
        // If the bottom of the popover would be below the scroll area, scroll it into view
        if (buttonRect.bottom + estimatedPopoverHeight > parentRect.bottom) {
          scrollParent.scrollTop +=
            buttonRect.bottom +
            estimatedPopoverHeight -
            parentRect.bottom +
            padding;
        }
      }
    }
  }, [isCalendarOpen, scrollIntoViewOnOpen, pickerButtonRef]);

  // Handle scroll into view when calendar opens
  useEffect(() => {
    if (isCalendarOpen && scrollIntoViewOnOpen) {
      if (popoverRef.current) {
        popoverRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      } else if (pickerButtonRef?.current) {
        pickerButtonRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }
  }, [isCalendarOpen, scrollIntoViewOnOpen, pickerButtonRef]);

  // Handle click outside to close calendar (handled at modal level for better UX)

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

    // If minDate is set and this is the end time picker, and the new time is before or equal to minDate on the same day, increment the date by one day
    if (
      minDate &&
      newDate.getFullYear() === minDate.getFullYear() &&
      newDate.getMonth() === minDate.getMonth() &&
      newDate.getDate() === minDate.getDate()
    ) {
      const minTimeValue = minDate.getHours() * 60 + minDate.getMinutes();
      const newTimeValue = newDate.getHours() * 60 + newDate.getMinutes();
      if (newTimeValue <= minTimeValue) {
        newDate.setDate(newDate.getDate() + 1);
      }
    }

    setSelectedDate(newDate);
    setDate(newDate);
  };

  const handleManualTimeSubmit = (e?: React.KeyboardEvent) => {
    if (e && e.key !== 'Enter') return;

    try {
      if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(manualTimeInput)) {
        if (date) {
          const [h, m] = manualTimeInput.split(':').map(Number);
          if (
            typeof h === 'number' &&
            !isNaN(h) &&
            typeof m === 'number' &&
            !isNaN(m)
          ) {
            const newDate = new Date(date);
            newDate.setHours(h);
            newDate.setMinutes(m);
            setSelectedDate(newDate);
            setDate(newDate);
            setIsManualTimeEntry(false);
            return;
          }
        }
      }
    } catch (error) {
      console.error('Invalid time format', error);
    }
  };

  // Handle keyboard input for manual time entry
  const handleManualTimeKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Enter') {
      handleManualTimeSubmit(e);
    } else if (e.key === 'Escape') {
      setIsManualTimeEntry(false);
    }
  };

  // Generate time options in 15-minute increments
  const timeOptions = Array.from({ length: 24 * 4 }, (_, i) => {
    const hour = Math.floor(i / 4);
    const minute = (i % 4) * 15;
    const formattedHour = hour.toString().padStart(2, '0');
    const formattedMinute = minute.toString().padStart(2, '0');
    const value = `${formattedHour}:${formattedMinute}`;
    const display = format(parse(value, 'HH:mm', new Date()), 'h:mm a');
    return { value, display };
  });

  // Filter time options for end time picker
  let filteredTimeOptions = timeOptions;
  if (minTime && date && minDate) {
    // Only restrict if the selected date is the same as minDate
    if (
      date.getFullYear() === minDate.getFullYear() &&
      date.getMonth() === minDate.getMonth() &&
      date.getDate() === minDate.getDate()
    ) {
      filteredTimeOptions = timeOptions.filter((time) => time.value > minTime);
    } else if (date > minDate) {
      // If end date is after start date, show all times
      filteredTimeOptions = timeOptions;
    }
  }
  // After filtering, ensure the selected time is always present in the dropdown
  if (date) {
    const customValue = `${format(date, 'HH')}:${format(date, 'mm')}`;
    if (!filteredTimeOptions.some((t) => t.value === customValue)) {
      filteredTimeOptions = [
        ...filteredTimeOptions,
        { value: customValue, display: format(date, 'h:mm a') },
      ];
      filteredTimeOptions.sort((a, b) => a.value.localeCompare(b.value));
    }
  }

  // If the filtered list is empty, show an error message
  const noValidTimes = filteredTimeOptions.length === 0;

  return (
    <div className="flex flex-col gap-2" ref={popoverRef}>
      <div className="flex gap-2">
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              ref={pickerButtonRef}
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
          <PopoverContent
            className="w-auto p-0"
            align="start"
            side="bottom"
            sideOffset={4}
            avoidCollisions={false}
          >
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleSelect}
              onSubmit={(date) => {
                handleSelect(date);
                setIsCalendarOpen(false);
              }}
              initialFocus
              disabled={
                minDate
                  ? {
                      before: new Date(
                        minDate.getFullYear(),
                        minDate.getMonth(),
                        minDate.getDate()
                      ),
                    }
                  : undefined
              }
            />
          </PopoverContent>
        </Popover>

        {showTimeSelect && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />

            {isManualTimeEntry ? (
              <div className="flex items-center gap-1">
                <Input
                  value={manualTimeInput}
                  onChange={(e) => setManualTimeInput(e.target.value)}
                  onKeyDown={handleManualTimeKeyDown}
                  placeholder="HH:MM"
                  className="w-[90px]"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleManualTimeSubmit()}
                  className="h-8 w-8"
                >
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <Select
                  value={
                    noValidTimes
                      ? undefined
                      : date
                        ? `${format(date, 'HH')}:${format(date, 'mm')}`
                        : undefined
                  }
                  onValueChange={handleTimeChange}
                  disabled={noValidTimes}
                >
                  <SelectTrigger className="w-[110px]">
                    <SelectValue
                      placeholder={
                        noValidTimes ? 'Invalid time selection' : 'Select time'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent
                    className="max-h-[300px]"
                    position="popper"
                    side="bottom"
                    sideOffset={4}
                  >
                    {filteredTimeOptions.map((time) => (
                      <SelectItem key={time.value} value={time.value}>
                        {time.display}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {noValidTimes && (
                  <div className="mt-1 text-xs text-destructive">
                    No valid end times available. Please select an earlier start
                    time or check your time selection.
                  </div>
                )}
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
