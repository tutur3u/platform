'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

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
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [pendingCopy, setPendingCopy] = useState(false);

  // Use defaultWeekTimeRanges if value is null
  const timeRanges = value || defaultWeekTimeRanges;

  // Ensure each day has a valid timeBlocks array
  const safeTimeRanges = Object.entries(timeRanges).reduce(
    (acc, [day, dayRange]) => {
      acc[day as keyof WeekTimeRanges] = {
        enabled: dayRange?.enabled ?? false,
        timeBlocks: dayRange?.timeBlocks ?? [{ ...defaultTimeBlock }],
      };
      return acc;
    },
    {} as WeekTimeRanges
  );

  // Helper to convert time string to minutes
  const timeToMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  // Helper to convert minutes to time string
  const minutesToTime = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  // Validation for a single block
  const validateTimeRange = (
    startTime: string,
    endTime: string,
    prevEnd?: string,
    nextStart?: string
  ): {
    isValid: boolean;
    message?: string;
    correctedEnd?: string;
    correctedStart?: string;
  } => {
    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    if (endMin <= startMin) {
      return { isValid: false, message: 'End time must be after start time' };
    }
    if (endMin - startMin < 30) {
      return {
        isValid: false,
        message: 'Time block must be at least 30 minutes',
      };
    }
    if (startMin < 0) {
      return {
        isValid: false,
        message: 'Start time cannot be before 12:00 AM',
      };
    }
    if (endMin > 1439) {
      return { isValid: false, message: 'End time cannot be after 11:59 PM' };
    }
    if (prevEnd && startMin < timeToMinutes(prevEnd)) {
      return {
        isValid: false,
        message: 'Start time overlaps with previous block',
        correctedStart: prevEnd,
      };
    }
    if (nextStart && endMin > timeToMinutes(nextStart)) {
      return {
        isValid: false,
        message: 'End time overlaps with next block',
        correctedEnd: nextStart,
      };
    }
    return { isValid: true };
  };

  // Can we add another block?
  const canAddMoreBlocks = (day: keyof WeekTimeRanges) => {
    const blocks = safeTimeRanges[day]?.timeBlocks || [];
    if (blocks.length === 0) return true;
    const lastBlock = blocks[blocks.length - 1];
    const lastEnd = timeToMinutes(lastBlock.endTime);
    // If less than 30 min left in the day, can't add
    return lastEnd <= 1409; // 1409 = 23*60+29
  };

  // Reason for disabling add button
  const addBlockDisabledReason = (day: keyof WeekTimeRanges) => {
    const blocks = safeTimeRanges[day]?.timeBlocks || [];
    if (blocks.length === 0) return '';
    const lastBlock = blocks[blocks.length - 1];
    const lastEnd = timeToMinutes(lastBlock.endTime);
    if (lastEnd > 1409) return 'No time left in the day for a 30-minute block';
    return '';
  };

  // Add a new time block
  const addTimeBlock = (day: keyof WeekTimeRanges) => {
    const newTimeRanges = { ...safeTimeRanges };
    const blocks = newTimeRanges[day]?.timeBlocks || [];
    const lastBlock = blocks[blocks.length - 1];
    let newStartMin = lastBlock ? timeToMinutes(lastBlock.endTime) : 540; // 09:00
    let newEndMin = newStartMin + 30;
    if (newEndMin > 1439) newEndMin = 1439; // Clamp to 11:59 PM
    if (newEndMin - newStartMin < 30) {
      toast.error('Not enough time left in the day for a 30-minute block');
      return;
    }
    const newStartTime = minutesToTime(newStartMin);
    const newEndTime = minutesToTime(newEndMin);
    // Prevent overlap
    if (blocks.length > 0 && newStartTime < blocks[blocks.length - 1].endTime) {
      toast.error('New block overlaps with previous block');
      return;
    }
    newTimeRanges[day].timeBlocks.push({
      startTime: newStartTime,
      endTime: newEndTime,
    });
    onChange(newTimeRanges as WeekTimeRanges);
  };

  // Handle time input changes with validation and auto-correction
  const handleTimeChange = (
    day: keyof WeekTimeRanges,
    blockIndex: number,
    field: keyof TimeBlock,
    newValue: string
  ) => {
    const newTimeRanges = { ...safeTimeRanges };
    const blocks = newTimeRanges[day].timeBlocks;
    const prevEnd = blockIndex > 0 ? blocks[blockIndex - 1].endTime : undefined;
    const nextStart =
      blockIndex < blocks.length - 1
        ? blocks[blockIndex + 1].startTime
        : undefined;
    let updatedBlock = {
      ...blocks[blockIndex],
      [field]: newValue,
    };
    const { isValid, message, correctedEnd, correctedStart } =
      validateTimeRange(
        field === 'startTime' ? newValue : updatedBlock.startTime,
        field === 'endTime' ? newValue : updatedBlock.endTime,
        prevEnd,
        nextStart
      );
    if (!isValid) {
      // Auto-correct if possible
      if (correctedEnd) {
        updatedBlock.endTime = correctedEnd;
        toast.error(message + '. Auto-corrected end time.');
      } else if (correctedStart) {
        updatedBlock.startTime = correctedStart;
        toast.error(message + '. Auto-corrected start time.');
      } else {
        toast.error(message);
        return;
      }
    }
    blocks[blockIndex] = updatedBlock;
    onChange(newTimeRanges as WeekTimeRanges);
  };

  const handleDayToggle = (day: keyof WeekTimeRanges, enabled: boolean) => {
    const newTimeRanges = { ...safeTimeRanges };
    if (!newTimeRanges[day]) {
      newTimeRanges[day] = { ...defaultTimeRange };
    }
    newTimeRanges[day] = {
      ...newTimeRanges[day],
      enabled,
    };
    onChange(newTimeRanges as WeekTimeRanges);
  };

  const removeTimeBlock = (day: keyof WeekTimeRanges, blockIndex: number) => {
    const newTimeRanges = { ...safeTimeRanges };

    // Don't remove the last block
    if ((newTimeRanges?.[day]?.timeBlocks?.length || 0) <= 1) return;

    newTimeRanges[day]?.timeBlocks?.splice(blockIndex, 1);
    onChange(newTimeRanges as WeekTimeRanges);
  };

  const handleCopyToAllDays = () => {
    setShowCopyDialog(true);
  };

  const confirmCopyToAllDays = () => {
    setShowCopyDialog(false);
    setPendingCopy(true);
    // Actually perform the copy
    const currentDaySettings = safeTimeRanges[activeDay];
    const newTimeRanges = { ...safeTimeRanges };
    days.forEach(({ key }) => {
      if (key !== activeDay) {
        newTimeRanges[key] = {
          ...newTimeRanges[key], // preserve enabled status
          timeBlocks: currentDaySettings.timeBlocks.map((block) => ({
            ...block,
          })),
        };
      }
    });
    onChange(newTimeRanges as WeekTimeRanges);
    setPendingCopy(false);
  };

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

  return (
    <div className="space-y-4">
      {showDaySelector && !compact && (
        <div className="flex items-center justify-between">
          {label && <Label className="text-base">{label}</Label>}
          <AlertDialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                onClick={handleCopyToAllDays}
                disabled={pendingCopy}
              >
                <Copy className="h-4 w-4" />
                <span>Copy to all days</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Copy to all days?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will overwrite the hours for all days with the current
                  day's settings. Are you sure you want to continue?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmCopyToAllDays}>
                  Yes, copy to all days
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
                      !safeTimeRanges[key]?.enabled && 'opacity-50'
                    )}
                    onClick={() => setActiveDay(key)}
                  >
                    {dayLabel}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {fullLabel}
                  {!safeTimeRanges[key]?.enabled && ' (Disabled)'}
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
                  checked={safeTimeRanges[key]?.enabled || false}
                  onCheckedChange={(checked) => handleDayToggle(key, checked)}
                />
                <Label
                  htmlFor={`enable-${key}`}
                  className={cn(
                    'font-medium',
                    !safeTimeRanges[key]?.enabled && 'text-muted-foreground',
                    compact && 'text-sm'
                  )}
                >
                  {fullLabel}
                </Label>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn('gap-1', compact && 'h-6 text-xs')}
                      onClick={() => addTimeBlock(key)}
                      disabled={
                        !safeTimeRanges[key]?.enabled || !canAddMoreBlocks(key)
                      }
                      aria-disabled={
                        !safeTimeRanges[key]?.enabled || !canAddMoreBlocks(key)
                      }
                    >
                      <Plus
                        className={cn('h-3.5 w-3.5', compact && 'h-3 w-3')}
                      />
                      <span className="text-xs">
                        {!canAddMoreBlocks(key)
                          ? 'Maximum blocks reached'
                          : 'Add Time Block'}
                      </span>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {!canAddMoreBlocks(key)
                    ? addBlockDisabledReason(key) ||
                      'No time left in the day for a 30-minute block'
                    : 'Add a new time block'}
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Time block inputs with improved visual separation */}
            {safeTimeRanges[key]?.enabled && (
              <div
                className={cn(
                  'space-y-2',
                  compact && 'max-h-[150px] overflow-y-auto pr-1'
                )}
              >
                {safeTimeRanges[key]?.timeBlocks?.map((block, blockIndex) => (
                  <div
                    key={blockIndex}
                    className="hover:bg-muted/30 border-muted bg-muted/10 flex items-center gap-2 rounded-md border p-3 shadow-sm transition-colors"
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
                          min={
                            blockIndex > 0
                              ? safeTimeRanges[key].timeBlocks[blockIndex - 1]
                                  .endTime
                              : '00:00'
                          }
                          max={block.endTime}
                          step="60"
                          onChange={(e) =>
                            handleTimeChange(
                              key,
                              blockIndex,
                              'startTime',
                              e.target.value
                            )
                          }
                          className={cn(
                            'h-8',
                            compact && 'h-7 text-xs',
                            'bg-background text-foreground',
                            'appearance-none',
                            'border-muted border',
                            'focus:ring-primary focus:outline-none focus:ring-2'
                          )}
                          autoComplete="off"
                          spellCheck={false}
                          inputMode="numeric"
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
                          min={block.startTime}
                          max={
                            blockIndex <
                            safeTimeRanges[key].timeBlocks.length - 1
                              ? safeTimeRanges[key].timeBlocks[blockIndex + 1]
                                  .startTime
                              : '23:59'
                          }
                          step="60"
                          onChange={(e) =>
                            handleTimeChange(
                              key,
                              blockIndex,
                              'endTime',
                              e.target.value
                            )
                          }
                          className={cn(
                            'h-8',
                            compact && 'h-7 text-xs',
                            'bg-background text-foreground',
                            'appearance-none',
                            'border-muted border',
                            'focus:ring-primary focus:outline-none focus:ring-2'
                          )}
                          autoComplete="off"
                          spellCheck={false}
                          inputMode="numeric"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTimeBlock(key, blockIndex)}
                        disabled={safeTimeRanges[key]?.timeBlocks?.length <= 1}
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
