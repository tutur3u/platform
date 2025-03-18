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
        setTimeLeft(null);
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

  if (!timeLeft) {
    return null;
  }

  return (
    <div className={`flex gap-2 text-sm font-medium ${className}`}>
      {timeLeft.days > 0 && (
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold">{timeLeft.days}</span>
          <span className="text-muted-foreground text-xs">days</span>
        </div>
      )}
      <div className="flex flex-col items-center">
        <span className="text-lg font-bold">
          {String(timeLeft.hours).padStart(2, '0')}
        </span>
        <span className="text-muted-foreground text-xs">hrs</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-lg font-bold">
          {String(timeLeft.minutes).padStart(2, '0')}
        </span>
        <span className="text-muted-foreground text-xs">min</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-lg font-bold">
          {String(timeLeft.seconds).padStart(2, '0')}
        </span>
        <span className="text-muted-foreground text-xs">sec</span>
      </div>
    </div>
  );
}
