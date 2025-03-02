'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface CountdownTimerProps {
  challengeId: string;
  startTime: string | null;
  endTime: string | null;
  duration: number; // duration in seconds
}

export default function CountdownTimer({
  challengeId,
  startTime,
  endTime,
  duration,
}: CountdownTimerProps) {
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState(duration); // duration is already in seconds

  useEffect(() => {
    if (!startTime || !endTime || !duration) return;

    const start = new Date(startTime).getTime();
    const end = start + duration * 1000; // convert seconds to milliseconds

    const updateTimer = async () => {
      const now = new Date().getTime();
      const remaining = Math.max(0, Math.floor((end - now) / 1000));
      setTimeLeft(remaining);

      if (remaining === 0) {
        try {
          const response = await fetch(
            `/api/v1/challenges/${challengeId}/session`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: 'ENDED',
                total_score: 0,
              }),
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
