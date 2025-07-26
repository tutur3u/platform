'use client';

import {
  doesTimeSpanMidnight,
  formatTimeRange,
} from '../../../../utils/timezone-helper';
import dayjs from 'dayjs';
import { Clock } from 'lucide-react';

interface TimeRangeDisplayProps {
  startTime: string;
  endTime: string;
  date?: string;
  showTimezoneInfo?: boolean;
  className?: string;
}

export default function TimeRangeDisplay({
  startTime,
  endTime,
  date = dayjs().format('YYYY-MM-DD'),
  showTimezoneInfo = true,
  className = '',
}: TimeRangeDisplayProps) {
  const spansMidnight = doesTimeSpanMidnight(startTime, endTime, date);
  const timeRangeText = formatTimeRange(startTime, endTime, date);

  return (
    <div className={`flex items-center gap-2 text-foreground/80 ${className}`}>
      <Clock className="h-4 w-4 text-dynamic-green" />
      <div className="flex flex-col">
        <span className="text-sm font-medium">{timeRangeText}</span>
        {showTimezoneInfo && (
          <div className="flex items-center gap-2 text-xs text-foreground/60">
            <span>local time</span>
            {spansMidnight && (
              <span className="text-dynamic-orange">• spans midnight</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
