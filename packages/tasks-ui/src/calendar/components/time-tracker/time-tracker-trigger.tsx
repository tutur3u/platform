'use client';

import { Square, Timer } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { forwardRef } from 'react';
import { formatTime } from './utils';

export interface TimeTrackerTriggerLabels {
  idle: string;
  running: string;
}

interface TimeTrackerTriggerProps {
  isRunning: boolean;
  elapsedTime: number;
  onClick: () => void;
  labels?: TimeTrackerTriggerLabels;
}

const DEFAULT_LABELS: TimeTrackerTriggerLabels = {
  idle: 'Time tracker',
  running: 'Running',
};

/**
 * A compact chip that opens the time tracker. While a session runs it
 * states that in text next to the elapsed time, not only through colour.
 */
export const TimeTrackerTrigger = forwardRef<
  HTMLButtonElement,
  TimeTrackerTriggerProps
>(function TimeTrackerTrigger(
  { isRunning, elapsedTime, onClick, labels = DEFAULT_LABELS, ...props },
  ref
) {
  const elapsed = formatTime(elapsedTime);
  return (
    <Button
      ref={ref}
      {...props}
      variant="outline"
      size="sm"
      className={cn(
        'h-7 gap-1.5 px-2 text-xs',
        isRunning && 'border-dynamic-red/40 text-dynamic-red'
      )}
      onClick={onClick}
      aria-label={
        isRunning ? `${labels.idle}: ${labels.running} ${elapsed}` : labels.idle
      }
    >
      {isRunning ? (
        <>
          <Square className="size-3" />
          <span className="font-mono tabular-nums">{elapsed}</span>
          <span>{labels.running}</span>
        </>
      ) : (
        <>
          <Timer className="size-3" />
          <span>{labels.idle}</span>
        </>
      )}
    </Button>
  );
});
