'use client';

import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { cn } from '@tuturuuu/utils/format';
import {
  buildDateInTimezone,
  getDatePartsInTimezone,
} from '@tuturuuu/utils/task-date-timezone';
import type { ReactNode } from 'react';

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
  const handleDateChange = (nextDate: Date | undefined) => {
    if (!nextDate || includeTime) {
      setDate(nextDate);
      return;
    }

    setDate(startOfDay(nextDate, preferences?.timezone));
  };

  return (
    <div className={cn('w-full', className)}>
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
        timeToggle={{
          checked: includeTime,
          disabled,
          label: includeTimeLabel,
          onCheckedChange: setIncludeTime,
        }}
      />
    </div>
  );
}
