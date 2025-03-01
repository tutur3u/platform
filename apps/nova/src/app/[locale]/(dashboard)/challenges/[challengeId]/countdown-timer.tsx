'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface CountdownTimerProps {
  challengeId: string;
  startTime: string | null;
  endTime: string | null;
  duration: number;
}

export default function CountdownTimer({
  challengeId,
  startTime,
  endTime,
  duration,
}: CountdownTimerProps) {
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState(duration * 60);

  useEffect(() => {
    if (!startTime || !endTime || !duration) return;

    const start = new Date(startTime).getTime();
    const end = start + duration * 60000;

    const updateTimer = async () => {
      const now = new Date().getTime();
      const remaining = Math.max(0, Math.floor((end - now) / 1000));
      setTimeLeft(remaining);

      if (remaining === 0) {
        try {
          const response = await fetch(
            `/api/v1/challenges/${challengeId}/status`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'ENDED' }),
            }
          );
          if (!response.ok) {
            throw new Error('Failed to end test');
          }
          router.push(`/challenges/${challengeId}/results`);
        } catch (error) {
          console.error('Error ending test: ', error);
        }
      }
    };

    const interval = setInterval(updateTimer, 1000);
    updateTimer();

    return () => clearInterval(interval);
  }, [challengeId, duration, router, startTime, endTime]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="text-xl font-bold text-red-600">
      Time Left: {minutes}:{seconds < 10 ? `0${seconds}` : seconds}
    </div>
  );
}
