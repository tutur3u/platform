'use client';

import { useEffect, useState } from 'react';

interface CountdownTimerProps {
  endTime: string;
  onAutoEnd: () => void;
}

export default function CountdownTimer({
  endTime,
  onAutoEnd,
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(0); // duration is already in seconds

  useEffect(() => {
    const updateTimer = () => {
      const now = Date.now();
      const end = new Date(endTime).getTime();

      if (now >= end) {
        setTimeLeft(0);
        onAutoEnd();
        return;
      }

      const remaining = Math.floor((end - now) / 1000);
      setTimeLeft(remaining);
    };

    updateTimer();

    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [endTime, onAutoEnd]);

  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="text-xl font-bold text-red-600">
      Time Left: {hours > 0 ? `${hours}:` : ''}
      {minutes.toString().padStart(2, '0')}:
      {seconds.toString().padStart(2, '0')}
    </div>
  );
}
