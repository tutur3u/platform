'use client';

import { formatDuration } from '@tuturuuu/utils/format';

interface DurationDisplayProps {
  seconds: number;
  className?: string;
}

export function DurationDisplay({
  seconds,
  className = '',
}: DurationDisplayProps) {
  // Calculate hours, minutes, seconds
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  // Function to determine color based on duration
  const getTimeColor = () => {
    if (seconds >= 14400) return 'text-purple-600'; // 4+ hours
    if (seconds >= 7200) return 'text-indigo-600'; // 2-4 hours
    if (seconds >= 3600) return 'text-blue-600'; // 1-2 hours
    if (seconds >= 1800) return 'text-emerald-600'; // 30-60 minutes
    return 'text-green-600'; // < 30 minutes
  };

  return (
    <div className={`flex items-center ${className}`}>
      <div className="flex items-baseline gap-1">
        <span className={`text-lg font-semibold ${getTimeColor()}`}>
          {formatDuration(seconds)}
        </span>
      </div>

      <div className="ml-3 flex gap-2">
        {hours > 0 && (
          <div className="flex flex-col items-center rounded bg-muted px-2 py-1">
            <span className="text-sm font-medium">{hours}</span>
            <span className="text-xs text-muted-foreground">hrs</span>
          </div>
        )}
        <div className="flex flex-col items-center rounded bg-muted px-2 py-1">
          <span className="text-sm font-medium">{minutes}</span>
          <span className="text-xs text-muted-foreground">min</span>
        </div>
        {(hours === 0 || remainingSeconds > 0) && (
          <div className="flex flex-col items-center rounded bg-muted px-2 py-1">
            <span className="text-sm font-medium">{remainingSeconds}</span>
            <span className="text-xs text-muted-foreground">sec</span>
          </div>
        )}
      </div>
    </div>
  );
}
