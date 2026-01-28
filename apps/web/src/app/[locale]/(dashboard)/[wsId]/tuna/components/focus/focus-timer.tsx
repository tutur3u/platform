'use client';

import { Clock, Square } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';

interface FocusTimerProps {
  isActive: boolean;
  elapsedSeconds: number;
  remainingSeconds: number;
  progress: number;
  isOvertime: boolean;
  goal?: string | null;
  onComplete: () => void;
  className?: string;
}

export function FocusTimer({
  isActive,
  elapsedSeconds,
  remainingSeconds,
  progress,
  isOvertime,
  goal,
  onComplete,
  className,
}: FocusTimerProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate stroke properties for circular progress
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  if (!isActive) {
    return null;
  }

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      {/* Goal display */}
      {goal && (
        <div className="max-w-xs text-center text-muted-foreground text-sm">
          <span className="font-medium">Goal:</span> {goal}
        </div>
      )}

      {/* Circular timer */}
      <div className="relative h-52 w-52">
        {/* Background circle */}
        <svg
          className="h-full w-full -rotate-90"
          viewBox="0 0 200 200"
          aria-label="Timer progress"
          role="img"
        >
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-muted/20"
          />
          {/* Progress circle */}
          <motion.circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            className={cn(
              isOvertime ? 'text-dynamic-yellow' : 'text-dynamic-purple'
            )}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </svg>

        {/* Time display in center */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="flex items-center gap-1">
            <Clock
              className={cn(
                'h-5 w-5',
                isOvertime ? 'text-dynamic-yellow' : 'text-dynamic-purple'
              )}
            />
            <span
              className={cn(
                'font-medium text-xs uppercase',
                isOvertime ? 'text-dynamic-yellow' : 'text-muted-foreground'
              )}
            >
              {isOvertime ? 'Overtime' : 'Remaining'}
            </span>
          </div>
          <span className="font-bold text-4xl tabular-nums">
            {isOvertime
              ? `+${formatTime(elapsedSeconds - (elapsedSeconds - remainingSeconds))}`
              : formatTime(remainingSeconds)}
          </span>
          <span className="text-muted-foreground text-sm">
            Elapsed: {formatTime(elapsedSeconds)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="lg"
          onClick={onComplete}
          className="gap-2"
        >
          <Square className="h-4 w-4" />
          End Session
        </Button>
      </div>

      {/* Encouragement message */}
      <div className="text-center">
        {isOvertime ? (
          <p className="font-medium text-dynamic-yellow text-sm">
            Amazing focus! Take a break when you&apos;re ready.
          </p>
        ) : progress > 75 ? (
          <p className="font-medium text-dynamic-green text-sm">
            Almost there! You&apos;re doing great!
          </p>
        ) : progress > 50 ? (
          <p className="text-muted-foreground text-sm">
            Halfway done. Keep up the great work!
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Stay focused. Tuna believes in you!
          </p>
        )}
      </div>
    </div>
  );
}
