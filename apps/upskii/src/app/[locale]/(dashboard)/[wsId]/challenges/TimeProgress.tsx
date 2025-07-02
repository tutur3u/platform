'use client';

import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useEffect, useState } from 'react';

interface Props {
  startTime: Date;
  endTime: Date;
  className?: string;
}

export function TimeProgress({ startTime, endTime, className }: Props) {
  const [progress, setProgress] = useState(0);
  const [isClosed, setIsClosed] = useState(false);

  useEffect(() => {
    const calculateProgress = () => {
      const now = new Date().getTime();

      const start = startTime.getTime();
      const end = endTime.getTime();

      // If we've passed the end date
      if (now >= end) {
        setProgress(0);
        setIsClosed(true);
        return;
      }

      // If we're before the start date
      if (now < start) {
        setProgress(100);
        return;
      }

      // Calculate percentage
      const totalDuration = end - start;
      const elapsed = end - now;
      const percentage = (elapsed / totalDuration) * 100;
      setProgress(percentage);
    };

    // Initial calculation
    calculateProgress();

    // Update every second
    const interval = setInterval(calculateProgress, 1000);

    return () => clearInterval(interval);
  }, [startTime, endTime]);

  // Determine color based on progress
  const getProgressColor = () => {
    if (isClosed) return 'bg-gray-500';
    if (progress > 75) return 'bg-green-500';
    if (progress > 50) return 'bg-yellow-500';
    if (progress > 25) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className={cn('w-full', className)}>
      <Progress
        value={progress}
        className="h-2 w-full"
        indicatorClassName={getProgressColor()}
      />
      {isClosed && (
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>Closed</span>
        </div>
      )}
    </div>
  );
}
