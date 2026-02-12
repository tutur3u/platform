'use client';

import { Square, Timer } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { formatTime } from './utils';

interface TimeTrackerTriggerProps {
  isRunning: boolean;
  elapsedTime: number;
  onClick: () => void;
}

export function TimeTrackerTrigger({
  isRunning,
  elapsedTime,
  onClick,
}: TimeTrackerTriggerProps) {
  return (
    <Button
      variant={isRunning ? 'destructive' : 'outline'}
      size="sm"
      className={cn('relative w-full gap-2')}
      onClick={onClick}
    >
      {isRunning && (
        <div className="absolute inset-0 animate-pulse bg-linear-to-r from-dynamic-red/20 to-transparent" />
      )}
      <div className="relative flex items-center gap-2">
        {isRunning ? (
          <>
            <Square className="h-3 w-3 animate-pulse" />
            <span className="@[100px]:inline hidden font-mono">
              {formatTime(elapsedTime)}
            </span>
            <span className="@[100px]:hidden font-mono">
              {Math.floor(elapsedTime / 60)}m
            </span>
          </>
        ) : (
          <>
            <Timer className="h-3 w-3" />
            <span className="@[100px]:inline hidden">Time Tracker</span>
            <span className="@[100px]:hidden">Timer</span>
          </>
        )}
      </div>
    </Button>
  );
}
