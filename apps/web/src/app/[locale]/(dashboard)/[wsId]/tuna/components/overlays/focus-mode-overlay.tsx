'use client';

import { Clock, Square, Target } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'framer-motion';

interface FocusModeOverlayProps {
  isActive: boolean;
  elapsedSeconds: number;
  remainingSeconds: number;
  progress: number;
  isOvertime: boolean;
  goal?: string | null;
  onComplete: () => void;
  className?: string;
}

export function FocusModeOverlay({
  isActive,
  elapsedSeconds,
  remainingSeconds,
  progress,
  isOvertime,
  goal,
  onComplete,
  className,
}: FocusModeOverlayProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate stroke properties for circular progress
  // Ring size should match the fish size (fish is h-64 w-80 at lg)
  const radius = 140;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  if (!isActive) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        className={cn('pointer-events-none fixed inset-0 z-40', className)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Progress ring - fixed at true center of viewport, behind fish */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <svg
            className="h-72 w-72 -rotate-90 md:h-96 md:w-96 lg:h-[420px] lg:w-[420px]"
            viewBox="0 0 320 320"
            aria-label="Focus session progress"
            role="img"
          >
            {/* Background circle */}
            <circle
              cx="160"
              cy="160"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-foreground/10"
            />
            {/* Progress circle */}
            <motion.circle
              cx="160"
              cy="160"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
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
        </motion.div>

        {/* Timer card - positioned at top center */}
        <motion.div
          className="pointer-events-auto absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="rounded-2xl border border-border/30 bg-background/80 px-6 py-4 text-center shadow-2xl backdrop-blur-xl">
            {/* Goal */}
            {goal && (
              <div className="mb-2 flex items-center justify-center gap-1.5 text-muted-foreground text-sm">
                <Target className="h-4 w-4" />
                <span className="max-w-xs truncate">{goal}</span>
              </div>
            )}

            {/* Status label */}
            <div className="flex items-center justify-center gap-1.5">
              <Clock
                className={cn(
                  'h-4 w-4',
                  isOvertime ? 'text-dynamic-yellow' : 'text-dynamic-purple'
                )}
              />
              <span
                className={cn(
                  'font-medium text-xs uppercase tracking-wide',
                  isOvertime ? 'text-dynamic-yellow' : 'text-muted-foreground'
                )}
              >
                {isOvertime ? 'Overtime' : 'Remaining'}
              </span>
            </div>

            {/* Time display */}
            <div className="mt-1 font-bold text-4xl tabular-nums md:text-5xl">
              {isOvertime
                ? `+${formatTime(Math.abs(remainingSeconds))}`
                : formatTime(remainingSeconds)}
            </div>

            {/* Elapsed time */}
            <div className="mt-1 text-muted-foreground text-sm">
              Elapsed: {formatTime(elapsedSeconds)}
            </div>
          </div>
        </motion.div>

        {/* End session button - positioned below center */}
        <motion.div
          className="pointer-events-auto absolute bottom-32 left-1/2 -translate-x-1/2 md:bottom-40"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <Button
            variant="outline"
            size="lg"
            onClick={onComplete}
            className="gap-2 bg-background/70 backdrop-blur-sm"
          >
            <Square className="h-4 w-4" />
            End Session
          </Button>
        </motion.div>

        {/* Encouragement message */}
        <motion.div
          className="absolute bottom-20 left-1/2 -translate-x-1/2 text-center md:bottom-28"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
