'use client';

import { useEffect, useState } from 'react';

interface CountdownProps {
  targetDate: Date;
  onComplete?: () => void;
  className?: string;
}

export function Countdown({
  targetDate,
  onComplete,
  className,
}: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = targetDate.getTime() - new Date().getTime();

      if (difference <= 0) {
        onComplete?.();
        return;
      }

      setTimeLeft({
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      });
    };

    // Initial calculation
    calculateTimeLeft();

    // Update every second
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [targetDate, onComplete]);

  return (
    <div className={`flex gap-2 text-sm font-medium ${className}`}>
      <div className="flex flex-col items-center">
        <span className="text-lg font-bold">{timeLeft?.days ?? 0}</span>
        <span className="text-xs text-muted-foreground">days</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-lg font-bold">
          {String(timeLeft?.hours ?? 0).padStart(2, '0')}
        </span>
        <span className="text-xs text-muted-foreground">hrs</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-lg font-bold">
          {String(timeLeft?.minutes ?? 0).padStart(2, '0')}
        </span>
        <span className="text-xs text-muted-foreground">min</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-lg font-bold">
          {String(timeLeft?.seconds ?? 0).padStart(2, '0')}
        </span>
        <span className="text-xs text-muted-foreground">sec</span>
      </div>
    </div>
  );
}
