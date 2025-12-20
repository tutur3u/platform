'use client';

import { Clock } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SessionWithRelations } from '@/app/[locale]/(dashboard)/[wsId]/time-tracker/types';

interface ActiveTimerIndicatorProps {
  wsId: string;
  session: SessionWithRelations;
  isCollapsed: boolean;
}

export function ActiveTimerIndicator({
  wsId,
  session,
  isCollapsed,
}: ActiveTimerIndicatorProps) {
  const [elapsedTime, setElapsedTime] = useState(0);

  // Calculate elapsed time
  useEffect(() => {
    if (!session?.start_time) return;

    const calculateElapsed = () => {
      const startTime = new Date(session.start_time).getTime();
      const now = Date.now();
      return Math.floor((now - startTime) / 1000);
    };

    // Set initial elapsed time
    setElapsedTime(calculateElapsed());

    // Update every second
    const interval = setInterval(() => {
      setElapsedTime(calculateElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.start_time]);

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const content = (
    <div className="flex items-center gap-2">
      {!isCollapsed ? (
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 font-semibold text-dynamic-green text-xs">
            {session.title}
          </div>
          <div className="mt-2 w-fit rounded border border-dynamic-green/20 bg-dynamic-green/10 px-2 py-0.5 font-bold font-mono text-dynamic-green text-sm opacity-70">
            {formatTime(elapsedTime)}
          </div>
        </div>
      ) : (
        <Clock className="h-4 w-4 text-dynamic-green" />
      )}
    </div>
  );

  return (
    <Link
      href={`/${wsId}/time-tracker/timer`}
      className={cn(
        'flex items-center rounded-md p-2',
        'border border-dynamic-green/20 bg-dynamic-green/10 hover:bg-dynamic-green/20',
        isCollapsed && 'justify-center'
      )}
      title={
        isCollapsed
          ? `${session.title} - ${formatTime(elapsedTime)}`
          : undefined
      }
    >
      {content}
    </Link>
  );
}
