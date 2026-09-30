'use client';

import { CalendarIcon, Check, Clock, Edit } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import {
  buildDateInTimezone,
  formatInTimezone,
  getDatePartsInTimezone,
  resolveTaskTimezone,
} from '@tuturuuu/utils/task-date-timezone';
import { getTimeFormatPattern } from '@tuturuuu/utils/time-helper';
import { format } from 'date-fns';
import {
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DATE_TIME_PICKER_LAYOUT_CLASS_NAMES } from './date-time-picker-layout';
import {
  createPickerTimeOptions,
  filterPickerTimeOptions,
  pickerCalendarBounds,
  pickerCalendarDate,
  pickerTimeWithMinimum,
  pickerWallTime,
} from './date-time-picker-values';
import { Separator } from './separator';

interface DateTimePickerProps {
  date?: Date;
  setDate: (date: Date | undefined) => void;
  showTimeSelect?: boolean;
  minDate?: Date;
  maxDate?: Date;
  minTime?: string;
  scrollIntoViewOnOpen?: boolean;
  pickerButtonRef?: React.RefObject<HTMLButtonElement | null>;
  disabled?: boolean;
  showFooterControls?: boolean;
  allowClear?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  collisionPadding?: number;
  /** Render the picker inline without a popover (useful inside dialogs) */
  inline?: boolean;
  timeToggle?: {
    checked: boolean;
    disabled?: boolean;
    label: ReactNode;
    onCheckedChange: (checked: boolean) => void;
  };
  preferences?: {
    weekStartsOn?: 0 | 1 | 6;
    timezone?: string;
    timeFormat?: '12h' | '24h';
  };
}

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
  maxDate,
  minTime,
  scrollIntoViewOnOpen = false,
  pickerButtonRef,
  disabled = false,
  showFooterControls = true,
  allowClear = true,
  side = 'bottom',
  align = 'start',
  collisionPadding = 16,
  inline = false,
  timeToggle,
  preferences,
}: DateTimePickerProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(date);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isManualTimeEntry, setIsManualTimeEntry] = useState(false);
  const [invalidManualTime, setInvalidManualTime] = useState(false);
  const [manualTimeInput, setManualTimeInput] = useState(
    date ? format(date, 'HH:mm') : ''
  );
  const popoverRef = useRef<HTMLDivElement>(null);
  const timeToggleId = useId();

  const tz = useMemo(
    () =>
      preferences?.timezone ? resolveTaskTimezone(preferences.timezone) : null,
    [preferences?.timezone]
  );
  const resolvedTimezoneLabel = useMemo(() => {
    if (tz) return tz.replace(/_/g, ' ');

    if (typeof Intl !== 'undefined') {
      return (
        Intl.DateTimeFormat().resolvedOptions().timeZone?.replace(/_/g, ' ') ||
        'Local time'
      );
    }

    return 'Local time';
  }, [tz]);

  // Update date directly without casting workaround
  const updateDate = (next?: Date) => {
    setDate(next);
  };

  // Keep selectedDate in sync with date prop
  useEffect(() => {
    setSelectedDate(date);
  }, [date]);

  // Keep manualTimeInput in sync with date prop (show time in configured TZ when set)
  useEffect(() => {
    if (!date) {
      setManualTimeInput('');
      return;
    }
    if (tz) {
      const parts = getDatePartsInTimezone(date, tz);
      setManualTimeInput(
        `${parts.hour.toString().padStart(2, '0')}:${parts.minute.toString().padStart(2, '0')}`
      );
    } else {
      setManualTimeInput(format(date, 'HH:mm'));
    }
  }, [date, tz]);

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
    let next: Date;
    if (tz) {
      const hour = date ? getDatePartsInTimezone(date, tz).hour : 0;
      const minute = date ? getDatePartsInTimezone(date, tz).minute : 0;
      if (
        date &&
        pickerCalendarDate(date, tz).getTime() === selectedDate.getTime()
      ) {
        next = new Date(date);
      } else {
        next = buildDateInTimezone(
          selectedDate.getFullYear(),
          selectedDate.getMonth() + 1,
          selectedDate.getDate(),
          hour,
          minute,
          tz
        );
        const parts = getDatePartsInTimezone(next, tz);
        if (
          parts.year !== selectedDate.getFullYear() ||
          parts.month !== selectedDate.getMonth() + 1 ||
          parts.day !== selectedDate.getDate() ||
          parts.hour !== hour ||
          parts.minute !== minute
        )
          return;
      }
    } else {
      if (date) {
        selectedDate.setHours(date.getHours());
        selectedDate.setMinutes(date.getMinutes());
      }
      next = selectedDate;
    }
    setSelectedDate(next);
    updateDate(next);
    if (!inline && !showTimeSelect) {
      setIsCalendarOpen(false);
    }
  };

  const handleTimeChange = (timeString: string) => {
    const parts = timeString.split(':');
    if (parts.length !== 2) return;

    const hourStr = parts[0];
    const minuteStr = parts[1];

    if (!hourStr || !minuteStr) return;

    const hours = parseInt(hourStr, 10);
    const minutes = parseInt(minuteStr, 10);

    if (Number.isNaN(hours) || Number.isNaN(minutes)) return;

    const baseDate = selectedDate ?? date ?? minDate ?? new Date();
    const newDate = pickerTimeWithMinimum(
      baseDate,
      hours,
      minutes,
      tz,
      minDate
    );
    if (!newDate) return;

    setSelectedDate(newDate);
    updateDate(newDate);
    if (!inline) {
      setIsCalendarOpen(false);
    }
  };

  const handleManualTimeSubmit = (e?: React.KeyboardEvent) => {
    if (e && e.key !== 'Enter') return;

    try {
      if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(manualTimeInput)) {
        const [h, m] = manualTimeInput.split(':').map(Number);
        if (
          typeof h === 'number' &&
          !Number.isNaN(h) &&
          typeof m === 'number' &&
          !Number.isNaN(m)
        ) {
          const baseDate = selectedDate ?? date ?? minDate ?? new Date();
          const newDate = pickerWallTime(baseDate, h, m, tz);
          if (!newDate) {
            setInvalidManualTime(true);
            return;
          }
          setInvalidManualTime(false);
          setSelectedDate(newDate);
          updateDate(newDate);
          setIsManualTimeEntry(false);
          if (!inline) {
            setIsCalendarOpen(false);
          }
          return;
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

  // Get time format preference (default to 12h)
  const timeFormat = preferences?.timeFormat ?? '12h';
  const timePattern = getTimeFormatPattern(timeFormat);

  const timeOptions = useMemo(
    () => createPickerTimeOptions(timeFormat),
    [timeFormat]
  );
  const filteredTimeOptions = useMemo(
    () =>
      filterPickerTimeOptions({
        date,
        minDate,
        maxDate,
        minTime,
        zone: tz,
        pattern: timePattern,
        timeFormat,
        options: timeOptions,
      }),
    [date, minDate, maxDate, minTime, tz, timePattern, timeFormat, timeOptions]
  );

  // If the filtered list is empty, show an error message
  const noValidTimes = filteredTimeOptions.length === 0;
  const selectedTimeValue = date
    ? (() => {
        if (tz !== null) {
          const p = getDatePartsInTimezone(date, tz);
          return `${p.hour.toString().padStart(2, '0')}:${p.minute.toString().padStart(2, '0')}`;
        }

        return `${format(date, 'HH')}:${format(date, 'mm')}`;
      })()
    : undefined;
  const selectedDateText = date
    ? tz !== null
      ? formatInTimezone(date, tz, 'MMM D, YYYY')
      : format(date, 'PPP')
    : null;
  const selectedTimeText = date
    ? tz !== null
      ? formatInTimezone(date, tz, timeFormat === '24h' ? 'HH:mm' : 'h:mm A')
      : format(date, timePattern)
    : null;

  const setSelectedValue = (next: Date | undefined) => {
    setSelectedDate(next);
    updateDate(next);
  };

  const handleSetNow = () => {
    let next = new Date();

    if (minDate && next < minDate) {
      next = new Date(minDate);
    }

    if (maxDate && next > maxDate) {
      next = new Date(maxDate);
    }

    setSelectedValue(next);
    if (!inline) {
      setIsCalendarOpen(false);
    }
  };

  const handleSetToday = () => {
    const now = new Date();
    const baseDate = selectedDate ?? date ?? now;
    let next: Date;

    if (tz) {
      const todayParts = getDatePartsInTimezone(now, tz);
      const timeParts = showTimeSelect
        ? getDatePartsInTimezone(baseDate, tz)
        : { hour: 0, minute: 0 };

      next = buildDateInTimezone(
        todayParts.year,
        todayParts.month,
        todayParts.day,
        timeParts.hour,
        timeParts.minute,
        tz
      );
    } else {
      next = new Date(now);

      if (showTimeSelect) {
        next.setHours(baseDate.getHours(), baseDate.getMinutes(), 0, 0);
      } else {
        next.setHours(0, 0, 0, 0);
      }
    }

    setSelectedValue(next);
    if (!inline && !showTimeSelect) {
      setIsCalendarOpen(false);
    }
  };

  const calendarDisabled = pickerCalendarBounds(minDate, maxDate, tz);

  const timeControl = showTimeSelect ? (
    <div className={DATE_TIME_PICKER_LAYOUT_CLASS_NAMES.time}>
      <div className="space-y-1">
        <div className="flex items-center gap-2 font-medium text-sm">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span>Time</span>
        </div>
        <div className="truncate text-muted-foreground text-xs">
          {resolvedTimezoneLabel}
        </div>
      </div>

      {isManualTimeEntry ? (
        <div className="flex items-center gap-2">
          <Input
            value={manualTimeInput}
            onChange={(e) => {
              setManualTimeInput(e.target.value);
              setInvalidManualTime(false);
            }}
            aria-invalid={invalidManualTime}
            onKeyDown={handleManualTimeKeyDown}
            placeholder="HH:MM"
            className="h-9 flex-1"
            aria-label="Enter time manually in HH:MM"
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            onClick={() => handleManualTimeSubmit()}
            aria-label="Confirm manual time"
          >
            <Check className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Select
            value={noValidTimes ? undefined : selectedTimeValue}
            onValueChange={handleTimeChange}
            disabled={noValidTimes}
            aria-label="Time options"
          >
            <SelectTrigger className="h-9 flex-1">
              <SelectValue
                placeholder={
                  noValidTimes ? 'Invalid time selection' : 'Select time'
                }
              />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {filteredTimeOptions.map((time) => (
                <SelectItem key={time.value} value={time.value}>
                  {time.display}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            onClick={() => setIsManualTimeEntry(true)}
            title="Enter time manually"
            aria-label="Switch to manual time entry"
          >
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleSetToday}
        >
          Today
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleSetNow}
          aria-label="Set to now"
        >
          Now
        </Button>
      </div>

      {noValidTimes && (
        <div className="text-destructive text-xs">
          No valid end times available. Please select an earlier start time or
          check your time selection.
        </div>
      )}
    </div>
  ) : null;

  // Inline content (used both for inline mode and popover content)
  const pickerContent = (
    <div className={DATE_TIME_PICKER_LAYOUT_CLASS_NAMES.container}>
      {date && (
        <div className="border-b bg-muted/30 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{selectedDateText}</span>
            {showTimeSelect && selectedTimeText && (
              <>
                <span className="shrink-0 text-muted-foreground">•</span>
                <span className="truncate text-muted-foreground">
                  {selectedTimeText}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      <div className={DATE_TIME_PICKER_LAYOUT_CLASS_NAMES.layout}>
        <div className={DATE_TIME_PICKER_LAYOUT_CLASS_NAMES.calendar}>
          <Calendar
            mode="single"
            selected={date ? pickerCalendarDate(date, tz) : undefined}
            today={pickerCalendarDate(new Date(), tz)}
            onSelect={handleSelect}
            onSubmit={(date) => {
              handleSelect(date);
              if (!inline && !showTimeSelect) {
                setIsCalendarOpen(false);
              }
            }}
            autoFocus
            disabled={calendarDisabled}
            preferences={preferences}
            aria-label="Calendar selector"
          />
        </div>
        {timeControl}
      </div>

      {showFooterControls && !inline && (
        <>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2 p-2">
            <div className="flex items-center gap-2">
              {allowClear && (date || selectedDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedValue(undefined);
                    setIsCalendarOpen(false);
                  }}
                  aria-label="Clear selection"
                >
                  Clear
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!showTimeSelect && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSetToday}
                >
                  Today
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  if (isManualTimeEntry) {
                    handleManualTimeSubmit();
                  }
                  setIsCalendarOpen(false);
                }}
                aria-label="Done"
              >
                Done
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // Inline mode: render content directly without popover
  if (inline) {
    return (
      <div className="w-full rounded-lg border bg-popover text-popover-foreground">
        {pickerContent}
      </div>
    );
  }

  // Popover mode (default)
  const triggerButton = (
    <Button
      ref={pickerButtonRef}
      variant={timeToggle ? 'ghost' : 'outline'}
      className={cn(
        'min-h-10 justify-start text-left font-normal',
        timeToggle
          ? 'min-w-0 flex-1 rounded-none border-0 px-3 shadow-none hover:bg-transparent'
          : 'w-full',
        !date && 'text-muted-foreground'
      )}
      disabled={disabled}
      aria-label={
        date
          ? `Selected ${
              tz !== null
                ? formatInTimezone(
                    date,
                    tz,
                    `MMM D, YYYY ${timeFormat === '24h' ? 'HH:mm' : 'h:mm A'}`
                  )
                : format(date, `PPP ${timePattern}`)
            }`
          : 'Open date and time picker'
      }
    >
      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
      {date ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate">{selectedDateText}</span>
          {showTimeSelect && selectedTimeText && (
            <>
              <span className="text-muted-foreground">•</span>
              <span className="truncate text-muted-foreground">
                {selectedTimeText}
              </span>
            </>
          )}
        </div>
      ) : (
        <span>Pick a date{showTimeSelect ? ' and time' : ''}</span>
      )}
    </Button>
  );

  return (
    <div className="w-full" ref={popoverRef}>
      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
        {timeToggle ? (
          <div
            className={cn(
              'flex w-full overflow-hidden rounded-md border bg-background shadow-xs transition-colors',
              disabled && 'cursor-not-allowed opacity-60'
            )}
          >
            <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
            <div className="flex min-w-36 shrink-0 items-center justify-between gap-2 border-l bg-muted/30 px-3">
              <Label
                htmlFor={timeToggleId}
                className="flex min-w-0 items-center gap-2 font-medium text-sm"
              >
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{timeToggle.label}</span>
              </Label>
              <Switch
                id={timeToggleId}
                checked={timeToggle.checked}
                onCheckedChange={timeToggle.onCheckedChange}
                disabled={disabled || timeToggle.disabled}
                aria-label={
                  typeof timeToggle.label === 'string'
                    ? timeToggle.label
                    : undefined
                }
              />
            </div>
          </div>
        ) : (
          <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
        )}
        <PopoverContent
          className="flex max-h-[85vh] w-auto max-w-[calc(100vw-1rem)] flex-col p-0 sm:max-w-[calc(100vw-2rem)]"
          align={align}
          side={side}
          sideOffset={4}
          avoidCollisions={true}
          collisionPadding={collisionPadding}
          aria-label="Date and time selector"
        >
          {pickerContent}
        </PopoverContent>
      </Popover>
    </div>
  );
}
