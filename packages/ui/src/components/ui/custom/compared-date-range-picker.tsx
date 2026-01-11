'use client';

import {
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  ChevronUp,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { Locale } from 'date-fns';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { Button, buttonVariants } from '../button';
import { Label } from '../label';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../select';
import { Switch } from '../switch';
import { DateInput } from './date-input';

interface ComparedDateRangePickerProps {
  /** Click handler for applying the updates from DateRangePicker. */

  onUpdate?: (values: { range: DateRange; rangeCompare?: DateRange }) => void;
  /** Initial value for start date */
  initialDateFrom?: Date | string;
  /** Initial value for end date */
  initialDateTo?: Date | string;
  /** Initial value for start date for compare */
  initialCompareFrom?: Date | string;
  /** Initial value for end date for compare */
  initialCompareTo?: Date | string;
  /** Alignment of popover */
  align?: 'start' | 'center' | 'end';
  /** Option for locale */
  locale?: string | Locale;
  /** Option for showing compare feature */
  showCompare?: boolean;
  /** Calendar preferences for week start and timezone */
  preferences?: {
    weekStartsOn?: 0 | 1 | 6;
    timezone?: string;
  };
  /** Custom class name for the trigger button */
  className?: string;
  /** Labels for localization */
  labels?: {
    allDates?: string;
    compare?: string;
    vs?: string;
    cancel?: string;
    update?: string;
    clear?: string;
    presetsTitle?: string;
    presets?: {
      today?: string;
      yesterday?: string;
      last7?: string;
      last14?: string;
      last30?: string;
      thisWeek?: string;
      lastWeek?: string;
      thisMonth?: string;
      lastMonth?: string;
    };
  };
}

const formatDate = (date: Date, locale: string | Locale = 'en-US'): string => {
  if (typeof locale === 'string') {
    return date.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return date.toLocaleDateString(locale.code || 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const getDateAdjustedForTimezone = (dateInput: Date | string): Date => {
  if (typeof dateInput === 'string') {
    const parts = dateInput.split('-').map((part) => parseInt(part, 10));
    const date = new Date(parts[0]!, parts[1]! - 1, parts[2]);
    return date;
  } else if (dateInput instanceof Date) {
    return dateInput;
  } else {
    return new Date();
  }
};

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

interface Preset {
  name: string;
  label: string;
}

// Define presets
const PRESETS: Preset[] = [
  { name: 'today', label: 'Today' },
  { name: 'yesterday', label: 'Yesterday' },
  { name: 'last7', label: 'Last 7 days' },
  { name: 'last14', label: 'Last 14 days' },
  { name: 'last30', label: 'Last 30 days' },
  { name: 'thisWeek', label: 'This Week' },
  { name: 'lastWeek', label: 'Last Week' },
  { name: 'thisMonth', label: 'This Month' },
  { name: 'lastMonth', label: 'Last Month' },
];

// Pure function to get date range for a preset
const getPresetRange = (
  presetName: string
): { from: Date; to: Date | undefined } => {
  const preset = PRESETS.find(({ name }) => name === presetName);
  if (!preset) throw new Error(`Unknown date range preset: ${presetName}`);
  const from = new Date();
  const to = new Date();
  const first = from.getDate() - from.getDay();

  switch (preset.name) {
    case 'today':
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
      break;
    case 'yesterday':
      from.setDate(from.getDate() - 1);
      from.setHours(0, 0, 0, 0);
      to.setDate(to.getDate() - 1);
      to.setHours(23, 59, 59, 999);
      break;
    case 'last7':
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
      break;
    case 'last14':
      from.setDate(from.getDate() - 13);
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
      break;
    case 'last30':
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
      break;
    case 'thisWeek':
      from.setDate(first);
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
      break;
    case 'lastWeek':
      from.setDate(from.getDate() - 7 - from.getDay());
      to.setDate(to.getDate() - to.getDay() - 1);
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
      break;
    case 'thisMonth':
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
      break;
    case 'lastMonth':
      from.setMonth(from.getMonth() - 1);
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      to.setDate(0);
      to.setHours(23, 59, 59, 999);
      break;
  }

  return { from, to };
};

/** The DateRangePicker component allows a user to select a range of dates */
export const ComparedDateRangePicker = ({
  initialDateFrom,
  initialDateTo,
  initialCompareFrom,
  initialCompareTo,
  onUpdate,
  align = 'end',
  locale = 'en-US',
  showCompare = true,
  className,
  labels,
}: ComparedDateRangePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const [range, setRange] = useState<DateRange>({
    from: initialDateFrom
      ? getDateAdjustedForTimezone(initialDateFrom)
      : undefined,
    to: initialDateTo
      ? getDateAdjustedForTimezone(initialDateTo)
      : initialDateFrom
        ? getDateAdjustedForTimezone(initialDateFrom)
        : undefined,
  });
  const [rangeCompare, setRangeCompare] = useState<DateRange | undefined>(
    initialCompareFrom
      ? {
          from: new Date(new Date(initialCompareFrom).setHours(0, 0, 0, 0)),
          to: initialCompareTo
            ? new Date(new Date(initialCompareTo).setHours(0, 0, 0, 0))
            : new Date(new Date(initialCompareFrom).setHours(0, 0, 0, 0)),
        }
      : undefined
  );

  // Refs to store the values of range and rangeCompare when the date picker is opened
  const openedRangeRef = useRef<DateRange | undefined>(undefined);
  const openedRangeCompareRef = useRef<DateRange | undefined>(undefined);

  const [selectedPreset, setSelectedPreset] = useState<string | undefined>(
    undefined
  );

  const [isSmallScreen, setIsSmallScreen] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 960 : false
  );

  useEffect(() => {
    const handleResize = (): void => {
      setIsSmallScreen(window.innerWidth < 960);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const setPreset = (preset: string): void => {
    const range = getPresetRange(preset);
    setRange(range);
    if (rangeCompare) {
      const rangeCompare = {
        from: new Date(
          range.from.getFullYear() - 1,
          range.from.getMonth(),
          range.from.getDate()
        ),
        to: range.to
          ? new Date(
              range.to.getFullYear() - 1,
              range.to.getMonth(),
              range.to.getDate()
            )
          : undefined,
      };
      setRangeCompare(rangeCompare);
    }
  };

  const checkPreset = useCallback((): void => {
    for (const preset of PRESETS) {
      const presetRange = getPresetRange(preset.name);

      if (!range.from) continue;

      const normalizedRangeFrom = new Date(range.from);
      normalizedRangeFrom.setHours(0, 0, 0, 0);
      const normalizedPresetFrom = new Date(
        presetRange.from.setHours(0, 0, 0, 0)
      );

      const normalizedRangeTo = new Date(range.to ?? 0);
      normalizedRangeTo.setHours(0, 0, 0, 0);
      const normalizedPresetTo = new Date(
        presetRange.to?.setHours(0, 0, 0, 0) ?? 0
      );

      if (
        normalizedRangeFrom.getTime() === normalizedPresetFrom.getTime() &&
        normalizedRangeTo.getTime() === normalizedPresetTo.getTime()
      ) {
        setSelectedPreset(preset.name);
        return;
      }
    }

    setSelectedPreset(undefined);
  }, [range.from, range.to]);

  const resetValues = (): void => {
    setRange({
      from:
        typeof initialDateFrom === 'string'
          ? getDateAdjustedForTimezone(initialDateFrom)
          : initialDateFrom,
      to: initialDateTo
        ? typeof initialDateTo === 'string'
          ? getDateAdjustedForTimezone(initialDateTo)
          : initialDateTo
        : typeof initialDateFrom === 'string'
          ? getDateAdjustedForTimezone(initialDateFrom)
          : initialDateFrom,
    });
    setRangeCompare(
      initialCompareFrom
        ? {
            from:
              typeof initialCompareFrom === 'string'
                ? getDateAdjustedForTimezone(initialCompareFrom)
                : initialCompareFrom,
            to: initialCompareTo
              ? typeof initialCompareTo === 'string'
                ? getDateAdjustedForTimezone(initialCompareTo)
                : initialCompareTo
              : typeof initialCompareFrom === 'string'
                ? getDateAdjustedForTimezone(initialCompareFrom)
                : initialCompareFrom,
          }
        : undefined
    );
  };

  useEffect(() => {
    checkPreset();
  }, [checkPreset]);

  const PresetButton = ({
    preset,
    label,
    isSelected,
  }: {
    preset: string;
    label: string;
    isSelected: boolean;
  }): React.ReactNode => (
    <Button
      className={cn(
        'h-7 w-full justify-between px-2 font-normal text-xs',
        isSelected && 'pointer-events-none bg-accent'
      )}
      variant="ghost"
      size="sm"
      onClick={() => {
        setPreset(preset);
      }}
    >
      {label}
      <span className={cn('pr-1 opacity-0', isSelected && 'opacity-70')}>
        <Check width={14} height={14} />
      </span>
    </Button>
  );

  const areRangesEqual = (a?: DateRange, b?: DateRange): boolean => {
    if (!a || !b) return a === b;
    return (
      a.from?.getTime() === b.from?.getTime() &&
      a.to?.getTime() === b.to?.getTime()
    );
  };

  // State for the calendar navigation
  const [month, setMonth] = useState<Date>(new Date());

  useEffect(() => {
    if (isOpen) {
      if (range.from) {
        // Center the calendar on the start date
        setMonth(range.from);
      } else {
        // Or current date
        setMonth(new Date());
      }
    }
  }, [isOpen, range.from]);

  return (
    <Popover
      modal={true}
      open={isOpen}
      onOpenChange={(open: boolean) => {
        if (open) {
          openedRangeRef.current = range;
          openedRangeCompareRef.current = rangeCompare;
        } else {
          resetValues();
        }
        setIsOpen(open);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('h-auto py-1', className)}>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="flex items-center gap-2 py-0.5">
                <CalendarIcon className="h-3.5 w-3.5 opacity-50" />
                <div className="font-medium text-xs">
                  {range.from ? (
                    `${formatDate(range.from, locale)}${
                      range.to != null
                        ? ` - ${formatDate(range.to, locale)}`
                        : ''
                    }`
                  ) : (
                    <span className="opacity-50">
                      {labels?.allDates ?? 'All dates'}
                    </span>
                  )}
                </div>
              </div>
              {rangeCompare?.from != null && (
                <div className="-mt-1 flex items-center justify-end gap-1 text-[10px] opacity-60">
                  <span>{labels?.vs ?? 'vs.'}</span>
                  <span>
                    {formatDate(rangeCompare.from, locale)}
                    {rangeCompare.to != null
                      ? ` - ${formatDate(rangeCompare.to, locale)}`
                      : ''}
                  </span>
                </div>
              )}
            </div>
            <div className="-mr-1 pl-0.5 opacity-60">
              {isOpen ? <ChevronUp width={14} /> : <ChevronDown width={14} />}
            </div>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-0">
        <div className="flex">
          <div className="flex flex-col">
            {/* Header / Inputs */}
            <div className="flex items-center justify-center gap-4 border-b px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1">
                  <DateInput
                    value={range.from}
                    onChange={(date) => {
                      const toDate =
                        range.to == null || date > range.to ? date : range.to;
                      setRange((prev) => ({
                        ...prev,
                        from: date,
                        to: toDate,
                      }));
                    }}
                  />
                  <div className="text-muted-foreground text-xs">-</div>
                  <DateInput
                    value={range.to}
                    onChange={(date) => {
                      if (!range.from) {
                        setRange({ from: date, to: date });
                        return;
                      }
                      const fromDate = date < range.from ? date : range.from;
                      setRange((prev) => ({
                        ...prev,
                        from: fromDate,
                        to: date,
                      }));
                    }}
                  />
                </div>
                {showCompare && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        defaultChecked={Boolean(rangeCompare)}
                        className="scale-75 data-[state=checked]:bg-primary"
                        onCheckedChange={(checked: boolean) => {
                          if (checked) {
                            if (!range.from) return;
                            if (!range.to) {
                              setRange({
                                from: range.from,
                                to: range.from,
                              });
                            }
                            setRangeCompare({
                              from: new Date(
                                range.from.getFullYear() - 1,
                                range.from.getMonth(),
                                range.from.getDate()
                              ),
                              to: range.to
                                ? new Date(
                                    range.to.getFullYear() - 1,
                                    range.to.getMonth(),
                                    range.to.getDate()
                                  )
                                : new Date(
                                    range.from.getFullYear() - 1,
                                    range.from.getMonth(),
                                    range.from.getDate()
                                  ),
                            });
                          } else {
                            setRangeCompare(undefined);
                          }
                        }}
                        id="compare-mode"
                      />
                      <Label
                        htmlFor="compare-mode"
                        className="cursor-pointer font-medium text-[10px] uppercase tracking-wider opacity-60 hover:opacity-100"
                      >
                        {labels?.compare ?? 'Compare'}
                      </Label>
                    </div>
                  </div>
                )}
              </div>

              {rangeCompare != null && (
                <div className="flex items-center gap-1.5 rounded-md border bg-background/50 px-2 py-1">
                  <DateInput
                    value={rangeCompare?.from}
                    onChange={(date) => {
                      if (rangeCompare) {
                        const compareToDate =
                          rangeCompare.to == null || date > rangeCompare.to
                            ? date
                            : rangeCompare.to;
                        setRangeCompare((prev) => ({
                          ...prev,
                          from: date,
                          to: compareToDate,
                        }));
                      } else {
                        setRangeCompare({ from: date, to: undefined });
                      }
                    }}
                  />
                  <div className="text-muted-foreground text-xs">-</div>
                  <DateInput
                    value={rangeCompare?.to}
                    onChange={(date) => {
                      if (rangeCompare?.from) {
                        const compareFromDate =
                          date < rangeCompare.from ? date : rangeCompare.from;
                        setRangeCompare({
                          ...rangeCompare,
                          from: compareFromDate,
                          to: date,
                        });
                      }
                    }}
                  />
                </div>
              )}
            </div>

            {isSmallScreen && (
              <div className="border-b px-2 py-2">
                <Select
                  defaultValue={selectedPreset}
                  onValueChange={(value) => {
                    setPreset(value);
                  }}
                >
                  <SelectTrigger className="mx-auto h-8 w-full text-xs">
                    <SelectValue
                      placeholder={
                        labels?.presets?.thisMonth ?? 'Select preset...'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((preset) => (
                      <SelectItem
                        key={preset.name}
                        value={preset.name}
                        className="text-xs"
                      >
                        {/* @ts-ignore */}
                        {labels?.presets?.[preset.name] ?? preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Calendar */}
            <div className="p-2">
              <DayPicker
                mode="range"
                selected={range}
                onSelect={(value: { from?: Date; to?: Date } | undefined) => {
                  // There's an issue where DayPicker returns undefined for both if you deselect.
                  // We also need to handle the case where only `from` is selected
                  if (value) {
                    setRange({ from: value.from, to: value.to });
                  } else {
                    setRange({ from: undefined, to: undefined });
                  }
                }}
                numberOfMonths={isSmallScreen ? 1 : 2}
                month={month}
                onMonthChange={setMonth}
                locale={typeof locale === 'string' ? undefined : locale}
                showOutsideDays={false}
                classNames={{
                  root: 'bg-transparent',
                  months:
                    'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
                  month: 'space-y-4',
                  month_caption:
                    'flex justify-center pt-1 relative items-center',
                  caption_label: 'text-sm font-medium',
                  nav: 'space-x-1 flex items-center',
                  button_previous: cn(
                    buttonVariants({ variant: 'outline', size: 'icon' }),
                    'absolute left-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100'
                  ),
                  button_next: cn(
                    buttonVariants({ variant: 'outline', size: 'icon' }),
                    'absolute right-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100'
                  ),
                  month_grid: 'w-full border-collapse space-y-1',
                  weekdays: 'flex w-full',
                  weekday:
                    'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem] text-center',
                  week: 'flex w-full mt-2',
                  day: 'h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].range_end)]:rounded-r-md [&:has([aria-selected].outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
                  day_button: cn(
                    buttonVariants({ variant: 'ghost' }),
                    'h-9 w-9 p-0 font-normal aria-selected:opacity-100'
                  ),
                  range_start: 'range-start',
                  range_end: 'range-end',
                  selected:
                    'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
                  today: 'bg-accent text-accent-foreground',
                  outside:
                    'outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30',
                  disabled: 'text-muted-foreground opacity-50',
                  range_middle:
                    'aria-selected:bg-accent aria-selected:text-accent-foreground',
                  hidden: 'invisible',
                }}
              />
            </div>
          </div>

          {/* Sidebar Presets */}
          {!isSmallScreen && (
            <div className="w-35 flex-col items-center justify-start gap-1 border-l bg-muted/10 p-2 text-left">
              <div className="mb-2 px-2 font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
                {labels?.presetsTitle ?? 'Presets'}
              </div>
              {PRESETS.map((preset) => (
                <PresetButton
                  key={preset.name}
                  preset={preset.name}
                  label={
                    labels?.presets?.[
                      preset.name as keyof typeof labels.presets
                    ] ?? preset.label
                  }
                  isSelected={selectedPreset === preset.name}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-1 border-t bg-muted/10 p-2">
          <Button
            onClick={() => {
              setIsOpen(false);
              setRange({ from: undefined, to: undefined });
              setRangeCompare(undefined);
              onUpdate?.({
                range: { from: undefined, to: undefined },
                rangeCompare: undefined,
              });
            }}
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
          >
            {labels?.clear ?? 'Clear'}
          </Button>
          <Button
            onClick={() => {
              setIsOpen(false);
              resetValues();
            }}
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
          >
            {labels?.cancel ?? 'Cancel'}
          </Button>
          <Button
            onClick={() => {
              setIsOpen(false);
              if (
                !areRangesEqual(range, openedRangeRef.current) ||
                !areRangesEqual(rangeCompare, openedRangeCompareRef.current)
              ) {
                onUpdate?.({ range: range as DateRange, rangeCompare });
              }
            }}
            size="sm"
            className="h-7 text-xs"
          >
            {labels?.update ?? 'Update'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
