'use client';

import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

export type TimeBlock = {
  startTime: string;
  endTime: string;
};

export type DayTimeRange = {
  enabled: boolean;
  timeBlocks: TimeBlock[];
};

export type WeekTimeRanges = {
  monday: DayTimeRange;
  tuesday: DayTimeRange;
  wednesday: DayTimeRange;
  thursday: DayTimeRange;
  friday: DayTimeRange;
  saturday: DayTimeRange;
  sunday: DayTimeRange;
};

const defaultTimeBlock: TimeBlock = {
  startTime: '09:00',
  endTime: '17:00',
};

const defaultTimeRange: DayTimeRange = {
  enabled: true,
  timeBlocks: [{ ...defaultTimeBlock }],
};

const defaultWeekendTimeRange: DayTimeRange = {
  enabled: false,
  timeBlocks: [{ ...defaultTimeBlock }],
};

export const defaultWeekTimeRanges: WeekTimeRanges = {
  monday: { ...defaultTimeRange },
  tuesday: { ...defaultTimeRange },
  wednesday: { ...defaultTimeRange },
  thursday: { ...defaultTimeRange },
  friday: { ...defaultTimeRange },
  saturday: { ...defaultWeekendTimeRange },
  sunday: { ...defaultWeekendTimeRange },
};

type TimeRangePickerProps = {
  label: string;
  value?: WeekTimeRanges | null;
  onChange: (value?: WeekTimeRanges | null | undefined) => void;
  showDaySelector?: boolean;
  dayFilter?: 'all' | 'weekday' | 'weekend';
  compact?: boolean;
};

export function TimeRangePicker({
  label,
  value,
  onChange,
  showDaySelector = true,
  dayFilter = 'all',
  compact = false,
}: TimeRangePickerProps) {
  const [activeDay, setActiveDay] = useState<keyof WeekTimeRanges>('monday');

  const days: Array<{
    key: keyof WeekTimeRanges;
    label: string;
    fullLabel: string;
    type: 'weekday' | 'weekend';
  }> = [
    { key: 'monday', label: 'M', fullLabel: 'Monday', type: 'weekday' },
    { key: 'tuesday', label: 'T', fullLabel: 'Tuesday', type: 'weekday' },
    { key: 'wednesday', label: 'W', fullLabel: 'Wednesday', type: 'weekday' },
    { key: 'thursday', label: 'T', fullLabel: 'Thursday', type: 'weekday' },
    { key: 'friday', label: 'F', fullLabel: 'Friday', type: 'weekday' },
    { key: 'saturday', label: 'S', fullLabel: 'Saturday', type: 'weekend' },
    { key: 'sunday', label: 'S', fullLabel: 'Sunday', type: 'weekend' },
  ];

  // Filter days based on dayFilter
  const filteredDays = days.filter((day) => {
    if (dayFilter === 'all') return true;
    return day.type === dayFilter;
  });

  const handleTimeChange = (
    day: keyof WeekTimeRanges,
    blockIndex: number,
    field: keyof TimeBlock,
    newValue: string
  ) => {
    const newTimeRanges = { ...value };
    if (newTimeRanges[day]?.timeBlocks?.[blockIndex]) {
      newTimeRanges[day].timeBlocks[blockIndex] = {
        ...newTimeRanges[day].timeBlocks[blockIndex],
        [field]: newValue,
      };
      onChange(newTimeRanges as WeekTimeRanges);
    }
  };

  const handleDayToggle = (day: keyof WeekTimeRanges, enabled: boolean) => {
    const newTimeRanges = { ...value };
    if (!newTimeRanges[day]) {
      newTimeRanges[day] = { ...defaultTimeRange };
    }
    newTimeRanges[day] = {
      ...newTimeRanges[day],
      enabled,
    };
    onChange(newTimeRanges as WeekTimeRanges);
  };

  const addTimeBlock = (day: keyof WeekTimeRanges) => {
    const newTimeRanges = { ...value };
    const lastBlock =
      newTimeRanges[day]?.timeBlocks?.[
        newTimeRanges[day].timeBlocks.length - 1
      ];

    // Create a new block starting 1 hour after the last block ends
    const lastEndTime = lastBlock ? lastBlock.endTime : '17:00';
    const parts = lastEndTime.split(':');
    const hours = parseInt(parts[0] || '0', 10);
    const minutes = parseInt(parts[1] || '0', 10);

    const newStartHour = (hours + 1) % 24;
    const newEndHour = (newStartHour + 1) % 24;

    const newStartTime = `${newStartHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    const newEndTime = `${newEndHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    if (newTimeRanges[day]?.timeBlocks) {
      newTimeRanges[day].timeBlocks.push({
        startTime: newStartTime,
        endTime: newEndTime,
      });
      onChange(newTimeRanges as WeekTimeRanges);
    }
  };

  const removeTimeBlock = (day: keyof WeekTimeRanges, blockIndex: number) => {
    const newTimeRanges = { ...value };

    // Don't remove the last block
    if ((newTimeRanges?.[day]?.timeBlocks?.length || 0) <= 1) return;

    newTimeRanges[day]?.timeBlocks?.splice(blockIndex, 1);
    onChange(newTimeRanges as WeekTimeRanges);
  };

  const copyToAllDays = () => {
    const currentDaySettings = value?.[activeDay];
    const newTimeRanges = { ...value };

    days.forEach(({ key }) => {
      if (key !== activeDay) {
        newTimeRanges[key] = { ...currentDaySettings } as DayTimeRange;
      }
    });

    onChange(newTimeRanges as WeekTimeRanges);
  };

  return (
    <div className="space-y-4">
      {showDaySelector && !compact && (
        <div className="flex items-center justify-between">
          {label && <Label className="text-base">{label}</Label>}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" onClick={copyToAllDays}>
                <Copy className="h-4 w-4" />
                <span>Copy to all days</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Copy current day settings to all days
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      <div className="space-y-4">
        {/* Day selector buttons */}
        {showDaySelector && !compact && (
          <div className="flex flex-wrap gap-2">
            {filteredDays.map(({ key, label: dayLabel, fullLabel }) => (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <Button
                    variant={activeDay === key ? 'default' : 'outline'}
                    size="sm"
                    className={cn(
                      'h-9 w-9 p-0',
                      !value?.[key]?.enabled && 'opacity-50'
                    )}
                    onClick={() => setActiveDay(key)}
                  >
                    {dayLabel}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {fullLabel}
                  {!value?.[key]?.enabled && ' (Disabled)'}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}

        {/* Day rows with time visualizations */}
        {filteredDays.map(({ key, fullLabel }) => (
          <div
            key={key}
            className={cn(
              'space-y-3',
              !compact && showDaySelector && key !== activeDay && 'hidden',
              compact && 'border-b pb-3 last:border-b-0 last:pb-0'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  id={`enable-${key}`}
                  checked={value?.[key]?.enabled || false}
                  onCheckedChange={(checked) => handleDayToggle(key, checked)}
                />
                <Label
                  htmlFor={`enable-${key}`}
                  className={cn(
                    'font-medium',
                    !value?.[key]?.enabled && 'text-muted-foreground',
                    compact && 'text-sm'
                  )}
                >
                  {fullLabel}
                </Label>
              </div>
              <Button
                variant="outline"
                size="sm"
                className={cn('gap-1', compact && 'h-6 text-xs')}
                onClick={() => addTimeBlock(key)}
                disabled={!value?.[key]?.enabled}
              >
                <Plus className={cn('h-3.5 w-3.5', compact && 'h-3 w-3')} />
                <span className="text-xs">Add Time Block</span>
              </Button>
            </div>

            {/* Time block inputs */}
            {value?.[key]?.enabled && (
              <div
                className={cn(
                  'space-y-2',
                  compact && 'max-h-[150px] overflow-y-auto pr-1'
                )}
              >
                {value[key]?.timeBlocks.map((block, blockIndex) => (
                  <div
                    key={blockIndex}
                    className="hover:bg-muted/30 flex items-center gap-2 rounded-md border p-2 transition-colors"
                  >
                    <div className="grid flex-1 grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label
                          htmlFor={`${key}-start-${blockIndex}`}
                          className="text-muted-foreground text-xs"
                        >
                          Start
                        </Label>
                        <Input
                          id={`${key}-start-${blockIndex}`}
                          type="time"
                          value={block.startTime}
                          onChange={(e) =>
                            handleTimeChange(
                              key,
                              blockIndex,
                              'startTime',
                              e.target.value
                            )
                          }
                          className={cn('h-8', compact && 'h-7 text-xs')}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label
                          htmlFor={`${key}-end-${blockIndex}`}
                          className="text-muted-foreground text-xs"
                        >
                          End
                        </Label>
                        <Input
                          id={`${key}-end-${blockIndex}`}
                          type="time"
                          value={block.endTime}
                          onChange={(e) =>
                            handleTimeChange(
                              key,
                              blockIndex,
                              'endTime',
                              e.target.value
                            )
                          }
                          className={cn('h-8', compact && 'h-7 text-xs')}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTimeBlock(key, blockIndex)}
                        disabled={value[key]?.timeBlocks.length <= 1}
                        className={cn('h-8 w-8', compact && 'h-7 w-7')}
                      >
                        <Trash2
                          className={cn('h-4 w-4', compact && 'h-3 w-3')}
                        />
                        <span className="sr-only">Remove time block</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
