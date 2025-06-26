import { Eye, EyeClosed } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
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
  isCountdown: boolean;
  timeLeft: number | null;
}

export default function TimeElapsedStatus({
  isCountdown,
  timeLeft,
}: TimeElapsedStatusProps) {
  const t = useTranslations('ws-quizzes.time');
  const [isVisible, setIsVisible] = useState(true);

  const toggleVisibility = () => setIsVisible((prev) => !prev);

  const timerLabel = isCountdown
    ? t('remaining') || 'Time Remaining'
    : t('elapsed') || 'Time Elapsed';

  const timerColorClass =
    isCountdown && timeLeft !== null && timeLeft <= 60
      ? 'text-destructive font-semibold' // red or warning
      : 'text-foreground';

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className={`text-sm md:text-base lg:text-lg ${timerColorClass}`}>
          {isVisible
            ? `${timerLabel}: ${
                timeLeft !== null ? formatSeconds(timeLeft) : '--:--'
              }`
            : timeLeft !== null
              ? t('hidden_remaining') || 'Time Hidden'
              : t('hidden_elapsed') || 'Time Hidden'}
        </p>
        <button
          type="button"
          onClick={toggleVisibility}
          className="ml-4 text-sm text-muted-foreground underline hover:text-foreground"
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
