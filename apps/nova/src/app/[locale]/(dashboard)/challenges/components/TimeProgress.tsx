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
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const calculateProgress = () => {
      const now = new Date();
      const start = startDate.getTime();
      const end = endDate.getTime();
      const current = now.getTime();

      // If we've passed the end date
      if (current >= end) {
        setProgress(100);
        setIsExpired(true);
        return;
      }

      // If we're before the start date
      if (current < start) {
        setProgress(0);
        return;
      }

      // Calculate percentage
      const totalDuration = end - start;
      const elapsed = current - start;
      const percentage = (elapsed / totalDuration) * 100;
      setProgress(Math.min(100, Math.max(0, percentage)));
    };

    // Initial calculation
    calculateProgress();

    // Update every second
    const timer = setInterval(calculateProgress, 1000);

    return () => clearInterval(timer);
  }, [startDate, endDate]);

  // Determine color based on progress
  const getProgressColor = () => {
    if (isExpired) return 'bg-gray-500';
    if (progress > 75) return 'bg-red-500';
    if (progress > 50) return 'bg-orange-500';
    if (progress > 25) return 'bg-yellow-500';
    return 'bg-green-500';
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
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>
          {new Date().getTime() < startDate.getTime()
            ? 'Not started'
            : `${Math.round(progress)}% elapsed`}
        </span>
        <span>{isExpired ? 'Expired' : ''}</span>
      </div>
    </div>
  );
}
