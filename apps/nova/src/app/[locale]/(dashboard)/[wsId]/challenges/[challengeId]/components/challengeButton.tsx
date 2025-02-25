'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface CountdownTimerProps {
  createdAt: string;
  duration: number;
  problemId: number;
  wsId: string;
  // onUpdateDuration: (remainingTime: number) => void;
}

export default function CountdownTimer({
  createdAt,
  duration,
  problemId,
  wsId,
  // onUpdateDuration,
}: CountdownTimerProps) {
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState(duration * 60);
  console.log(duration);
  useEffect(() => {
    if (!createdAt || !duration) return;

    const startTime = new Date(createdAt).getTime();
    const endTime = startTime + duration * 60000;

    const updateTimer = async () => {
      const now = new Date().getTime();
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      setTimeLeft(remaining);

      if (remaining === 0) {
        try {
          const response = await fetch(
            `/api/auth/workspace/${problemId}/nova/start-test`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ test_status: 'END' }),
            }
          );
          if (!response.ok) {
            throw new Error('Failed to end test');
          }
          router.push(`/${wsId}/challenges/${problemId}/test-ended`);
        } catch (error) {
          console.error('Error ending test: ', error);
        }
      }
    };

    const interval = setInterval(updateTimer, 1000);
    updateTimer();

    return () => clearInterval(interval);
  }, [createdAt, duration, router]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="text-xl font-bold text-red-600">
      Time Left: {minutes}:{seconds < 10 ? `0${seconds}` : seconds}
    </div>
  );
}
