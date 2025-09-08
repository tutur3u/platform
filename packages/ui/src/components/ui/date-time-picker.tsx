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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
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

    if (Number.isNaN(hours) || Number.isNaN(minutes)) return;

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
            !Number.isNaN(h) &&
            typeof m === 'number' &&
            !Number.isNaN(m)
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
    <div className="w-full" ref={popoverRef}>
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
            {date ? (
              <div className="flex items-center gap-2">
                <span>{format(date, 'PPP')}</span>
                {showTimeSelect && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">
                      {format(date, 'h:mm a')}
                    </span>
                  </>
                )}
              </div>
            ) : (
              <span>Pick a date{showTimeSelect ? ' and time' : ''}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="flex max-h-[85vh] w-auto max-w-[calc(100vw-1rem)] flex-col p-0 sm:max-w-[calc(100vw-2rem)]"
          align="start"
          side="bottom"
          sideOffset={4}
          avoidCollisions={true}
          collisionPadding={8}
        >
          {showTimeSelect ? (
            <Tabs defaultValue="date" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="date" className="flex items-center gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  Date
                </TabsTrigger>
                <TabsTrigger value="time" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Time
                </TabsTrigger>
              </TabsList>

              <TabsContent value="date" className="mt-0 p-0">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={handleSelect}
                  onSubmit={(date) => {
                    handleSelect(date);
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
              </TabsContent>

              <TabsContent value="time" className="mt-0 p-0">
                {selectedDate && (
                  <div className="space-y-4 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">Select time</span>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {date ? format(date, 'MMM d, yyyy') : ''}
                      </span>
                    </div>

                    {isManualTimeEntry ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={manualTimeInput}
                          onChange={(e) => setManualTimeInput(e.target.value)}
                          onKeyDown={handleManualTimeKeyDown}
                          placeholder="HH:MM"
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleManualTimeSubmit()}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
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
                          <SelectTrigger className="flex-1">
                            <SelectValue
                              placeholder={
                                noValidTimes
                                  ? 'Invalid time selection'
                                  : 'Select time'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {filteredTimeOptions.map((time) => (
                              <SelectItem key={time.value} value={time.value}>
                                {time.display}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setIsManualTimeEntry(true)}
                          title="Enter time manually"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    )}

                    {noValidTimes && (
                      <div className="text-destructive text-xs">
                        No valid end times available. Please select an earlier
                        start time or check your time selection.
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          ) : (
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
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
