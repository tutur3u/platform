import { Copy, Plus, Trash2 } from '@tuturuuu/icons';
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
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { TimeBlock, WeekTimeRanges } from './hour-settings-shared';
import {
  createSafeTimeRanges,
  DAY_KEYS,
  minutesToTime,
  normalizeTimeString,
  timeToMinutes,
} from './time-range-picker-helpers';

const defaultTimeBlock: TimeBlock = {
  startTime: '07:00',
  endTime: '23:00',
};

const defaultTimeRange = {
  enabled: true,
  timeBlocks: [{ ...defaultTimeBlock }],
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
  const t = useTranslations('calendar_settings');
  const format = useFormatter();
  const [activeDay, setActiveDay] = useState<keyof WeekTimeRanges>('monday');
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [pendingCopy, setPendingCopy] = useState(false);

  const safeTimeRanges = createSafeTimeRanges(value);
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    if (hours === undefined || minutes === undefined) return time;
    return format.dateTime(new Date(Date.UTC(2020, 0, 1, hours, minutes)), {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    });
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
      return { isValid: false, message: t('time_range.end_after_start') };
    }
    if (endMin - startMin < 30) {
      return {
        isValid: false,
        message: t('time_range.minimum_duration'),
      };
    }
    if (startMin < 0) {
      return {
        isValid: false,
        message: t('time_range.start_too_early'),
      };
    }
    if (endMin > 1439) {
      return { isValid: false, message: t('time_range.end_too_late') };
    }
    if (prevEnd && startMin < timeToMinutes(prevEnd)) {
      return {
        isValid: false,
        message: t('time_range.overlaps_previous'),
        correctedStart: prevEnd,
      };
    }
    if (nextStart && endMin > timeToMinutes(nextStart)) {
      return {
        isValid: false,
        message: t('time_range.overlaps_next'),
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
    if (!lastBlock) return true;
    const lastEnd = timeToMinutes(lastBlock.endTime);
    // If less than 30 min left in the day, can't add
    return lastEnd <= 1409; // 1409 = 23*60+29
  };

  // Reason for disabling add button
  const addBlockDisabledReason = (day: keyof WeekTimeRanges) => {
    const blocks = safeTimeRanges[day]?.timeBlocks || [];
    if (blocks.length === 0) return '';
    const lastBlock = blocks[blocks.length - 1];
    if (!lastBlock) return '';
    const lastEnd = timeToMinutes(lastBlock.endTime);
    if (lastEnd > 1409) return t('time_range.no_time_left');
    return '';
  };

  // Add a new time block
  const addTimeBlock = (day: keyof WeekTimeRanges) => {
    const newTimeRanges = { ...safeTimeRanges };
    const blocks = newTimeRanges[day]?.timeBlocks || [];
    const lastBlock = blocks[blocks.length - 1];
    const newStartMin = lastBlock ? timeToMinutes(lastBlock.endTime) : 540; // 09:00
    let newEndMin = newStartMin + 30;
    if (newEndMin > 1439) newEndMin = 1439; // Clamp to 11:59 PM
    if (newEndMin - newStartMin < 30) {
      toast.error(t('time_range.not_enough_time'));
      return;
    }
    const newStartTime = minutesToTime(newStartMin);
    const newEndTime = minutesToTime(newEndMin);
    // Prevent overlap
    if (
      blocks.length > 0 &&
      lastBlock &&
      timeToMinutes(newStartTime) < timeToMinutes(lastBlock.endTime)
    ) {
      toast.error(t('time_range.new_block_overlaps'));
      return;
    }
    if (!newTimeRanges[day]) {
      newTimeRanges[day] = { ...defaultTimeRange };
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
    const blocks = newTimeRanges[day]?.timeBlocks || [];
    const block = blocks[blockIndex];
    if (!block) return;

    const prevBlock = blockIndex > 0 ? blocks[blockIndex - 1] : undefined;
    const nextBlock =
      blockIndex < blocks.length - 1 ? blocks[blockIndex + 1] : undefined;
    const prevEnd = prevBlock?.endTime;
    const nextStart = nextBlock?.startTime;

    const updatedBlock = {
      ...block,
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
      const validationMessage = message ?? t('time_range.invalid');
      // Auto-correct if possible
      if (correctedEnd) {
        updatedBlock.endTime = correctedEnd;
        toast.error(
          t('time_range.auto_corrected_end', { message: validationMessage })
        );
      } else if (correctedStart) {
        updatedBlock.startTime = correctedStart;
        toast.error(
          t('time_range.auto_corrected_start', { message: validationMessage })
        );
      } else {
        toast.error(validationMessage);
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
    const dayRange = newTimeRanges[day];
    if (!dayRange) {
      newTimeRanges[day] = { ...defaultTimeRange, enabled };
    } else {
      dayRange.enabled = enabled;
    }
    onChange(newTimeRanges as WeekTimeRanges);
  };

  const removeTimeBlock = (day: keyof WeekTimeRanges, blockIndex: number) => {
    const newTimeRanges = { ...safeTimeRanges };
    if (!newTimeRanges[day]) {
      newTimeRanges[day] = { ...defaultTimeRange };
    }
    const dayRange = newTimeRanges[day];
    if (!dayRange) return;

    const blocks = dayRange.timeBlocks || [];
    if (blocks.length <= 1) return;

    blocks.splice(blockIndex, 1);
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
  }> = DAY_KEYS.map((key, index) => ({
    key,
    label: t(`days.${key}.narrow`),
    fullLabel: t(`days.${key}.full`),
    type: index < 5 ? 'weekday' : 'weekend',
  }));

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
                <span>{t('time_range.copy_all')}</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('time_range.copy_all_title')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('time_range.copy_all_description')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('time_range.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmCopyToAllDays}
                  disabled={pendingCopy}
                >
                  {t('time_range.confirm_copy_all')}
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
                      !safeTimeRanges[key]?.enabled &&
                        activeDay !== key &&
                        'opacity-50'
                    )}
                    onClick={() => setActiveDay(key)}
                  >
                    {dayLabel}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {fullLabel}
                  {!safeTimeRanges[key]?.enabled &&
                    ` ${t('time_range.click_to_enable')}`}
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
                          ? t('time_range.maximum_blocks')
                          : t('time_range.add_block')}
                      </span>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {!canAddMoreBlocks(key)
                    ? addBlockDisabledReason(key) ||
                      t('time_range.no_time_left')
                    : t('time_range.add_block_tooltip')}
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Visual timeline bar */}
            {safeTimeRanges[key]?.enabled &&
              (safeTimeRanges[key]?.timeBlocks?.length ?? 0) > 0 && (
                <div className="relative mt-2 h-8 rounded-md bg-muted/30">
                  {/* Hour markers */}
                  <div className="absolute inset-0 flex justify-between px-1 text-[10px] text-muted-foreground">
                    <span>{formatTime('00:00')}</span>
                    <span>{formatTime('06:00')}</span>
                    <span>{formatTime('12:00')}</span>
                    <span>{formatTime('18:00')}</span>
                    <span>{formatTime('00:00')}</span>
                  </div>
                  {/* Time blocks visualization */}
                  {safeTimeRanges[key]?.timeBlocks?.map((block, idx) => {
                    const startMin = timeToMinutes(block.startTime);
                    const endMin = timeToMinutes(block.endTime);
                    const left = (startMin / 1440) * 100;
                    const width = ((endMin - startMin) / 1440) * 100;
                    return (
                      <div
                        key={idx}
                        className="absolute top-3 h-4 rounded bg-primary/70 transition-all hover:bg-primary"
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${normalizeTimeString(block.startTime)} - ${normalizeTimeString(block.endTime)}`}
                      />
                    );
                  })}
                </div>
              )}

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
                    className="flex items-center gap-2 rounded-md border border-muted bg-muted/10 p-3 shadow-sm transition-colors hover:bg-muted/30"
                  >
                    <div className="grid flex-1 grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label
                          htmlFor={`${key}-start-${blockIndex}`}
                          className="text-muted-foreground text-xs"
                        >
                          {t('time_range.start')}
                        </Label>
                        <Input
                          id={`${key}-start-${blockIndex}`}
                          type="time"
                          value={normalizeTimeString(block.startTime)}
                          min={
                            blockIndex > 0
                              ? (safeTimeRanges[key]?.timeBlocks?.[
                                  blockIndex - 1
                                ]?.endTime ?? '00:00')
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
                            'border border-muted',
                            'focus:outline-none focus:ring-2 focus:ring-primary'
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
                          {t('time_range.end')}
                        </Label>
                        <Input
                          id={`${key}-end-${blockIndex}`}
                          type="time"
                          value={normalizeTimeString(block.endTime)}
                          min={block.startTime}
                          max={
                            blockIndex <
                            (safeTimeRanges[key]?.timeBlocks?.length ?? 0) - 1
                              ? (safeTimeRanges[key]?.timeBlocks?.[
                                  blockIndex + 1
                                ]?.startTime ?? '23:59')
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
                            'border border-muted',
                            'focus:outline-none focus:ring-2 focus:ring-primary'
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
                        <span className="sr-only">
                          {t('time_range.remove_block')}
                        </span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Disabled day message */}
            {!safeTimeRanges[key]?.enabled && (
              <div className="rounded-md border border-dashed bg-muted/10 p-4 text-center">
                <p className="text-muted-foreground text-sm">
                  {t('time_range.disabled_day')}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
