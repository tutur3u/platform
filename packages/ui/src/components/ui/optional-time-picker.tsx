'use client';

import { Clock } from '@tuturuuu/icons';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import {
  buildDateInTimezone,
  getDatePartsInTimezone,
} from '@tuturuuu/utils/task-date-timezone';
import type { ReactNode } from 'react';
import { useId } from 'react';

export interface OptionalTimePickerProps {
  date?: Date;
  setDate: (date: Date | undefined) => void;
  includeTime: boolean;
  setIncludeTime: (includeTime: boolean) => void;
  includeTimeLabel: ReactNode;
  disabled?: boolean;
  allowClear?: boolean;
  showFooterControls?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  collisionPadding?: number;
  className?: string;
  preferences?: {
    weekStartsOn?: 0 | 1 | 6;
    timezone?: string;
    timeFormat?: '12h' | '24h';
  };
}

function startOfDay(date: Date, timezone?: string) {
  if (!timezone) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  const parts = getDatePartsInTimezone(date, timezone);
  return buildDateInTimezone(
    parts.year,
    parts.month,
    parts.day,
    0,
    0,
    timezone
  );
}

export function OptionalTimePicker({
  date,
  setDate,
  includeTime,
  setIncludeTime,
  includeTimeLabel,
  disabled = false,
  allowClear = true,
  showFooterControls = true,
  side = 'bottom',
  align = 'start',
  collisionPadding = 16,
  className,
  preferences,
}: OptionalTimePickerProps) {
  const switchId = useId();

  const handleDateChange = (nextDate: Date | undefined) => {
    if (!nextDate || includeTime) {
      setDate(nextDate);
      return;
    }

    setDate(startOfDay(nextDate, preferences?.timezone));
  };

  return (
    <div className={cn('grid gap-2', className)}>
      <DateTimePicker
        date={date}
        setDate={handleDateChange}
        showTimeSelect={includeTime}
        allowClear={allowClear}
        showFooterControls={showFooterControls}
        disabled={disabled}
        side={side}
        align={align}
        collisionPadding={collisionPadding}
        preferences={preferences}
      />
      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
        <Label
          htmlFor={switchId}
          className="flex min-w-0 items-center gap-2 font-medium text-sm"
        >
          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{includeTimeLabel}</span>
        </Label>
        <Switch
          id={switchId}
          checked={includeTime}
          onCheckedChange={setIncludeTime}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
