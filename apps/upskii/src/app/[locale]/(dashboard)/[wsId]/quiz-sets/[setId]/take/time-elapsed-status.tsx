import { Eye, EyeClosed } from '@tuturuuu/ui/icons';
import { useState } from 'react';

// Format seconds as MM:SS
const formatSeconds = (sec: number) => {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

interface TimeElapsedStatusProps {
  t: (key: string, options?: Record<string, any>) => string;
  isCountdown: boolean;
  timeLeft: number | null;
}

export default function TimeElapsedStatus({
  t,
  isCountdown,
  timeLeft,
}: TimeElapsedStatusProps) {
  const [isVisible, setIsVisible] = useState(true);

  const toggleVisibility = () => setIsVisible((prev) => !prev);

  const timerLabel = isCountdown
    ? t('ws-quizzes.time_remaining') || 'Time Remaining'
    : t('ws-quizzes.time_elapsed') || 'Time Elapsed';

  const timerColorClass =
    isCountdown && timeLeft !== null && timeLeft <= 60
      ? 'text-destructive font-semibold' // red or warning
      : 'text-foreground';

  return (
    <div className="bg-card flex w-full flex-col gap-2 rounded-lg border p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className={`text-sm md:text-base lg:text-lg ${timerColorClass}`}>
          {isVisible
            ? `${timerLabel}: ${
                timeLeft !== null ? formatSeconds(timeLeft) : '--:--'
              }`
            : timeLeft !== null
              ? t('ws-quizzes.hidden_time_remaining') || 'Time Hidden'
              : t('ws-quizzes.hidden_time_elapsed') || 'Time Hidden'}
        </p>
        <button
          onClick={toggleVisibility}
          className="text-muted-foreground hover:text-foreground ml-4 text-sm underline"
        >
          {isVisible ? (
            <Eye className="h-5 w-5" />
          ) : (
            <EyeClosed className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}
