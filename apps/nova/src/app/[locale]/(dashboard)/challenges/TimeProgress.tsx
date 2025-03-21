'use client';

import { cn } from '@tuturuuu/utils/format';
import { useEffect, useState } from 'react';

interface TimeProgressProps {
  startDate: Date;
  endDate: Date;
  className?: string;
}

export function TimeProgress({
  startDate,
  endDate,
  className,
}: TimeProgressProps) {
  const [progress, setProgress] = useState(0);
  const [isClosed, setIsClosed] = useState(false);

  useEffect(() => {
    const calculateProgress = () => {
      const now = new Date();
      const current = now.getTime();

      const start = startDate.getTime();
      const end = endDate.getTime();

      // If we've passed the end date
      if (current > end) {
        setProgress(0);
        setIsClosed(true);
        return;
      }

      // If we're before the start date
      if (current < start) {
        setProgress(100);
        return;
      }

      // Calculate percentage
      const totalDuration = end - start;
      const elapsed = end - current;
      const percentage = (elapsed / totalDuration) * 100;
      setProgress(percentage);
    };

    // Initial calculation
    calculateProgress();

    // Update every second
    const interval = setInterval(calculateProgress, 1000);

    return () => clearInterval(interval);
  }, [startDate, endDate]);

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
      <div className="h-2 w-full rounded-full bg-gray-200">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-1000 ease-out',
            getProgressColor()
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
      {isClosed && (
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>Closed</span>
        </div>
      )}
    </div>
  );
}
