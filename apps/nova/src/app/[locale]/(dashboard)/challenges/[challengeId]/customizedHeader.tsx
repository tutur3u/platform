import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { ChevronLeft, ChevronRight, Clock, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';

interface CustomizedHeaderProps {
  problemLength: number;
  currentProblem: number;
  endTime: string;
  className?: string;
  onPrev: () => void;
  onNext: () => void;
  onEnd: () => void;
  onAutoEnd: () => void;
}

export default function CustomizedHeader({
  problemLength,
  currentProblem,
  endTime,
  className,
  onPrev,
  onNext,
  onEnd,
  onAutoEnd,
}: CustomizedHeaderProps) {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    totalSeconds: number;
    percentage: number;
  }>({
    hours: 0,
    minutes: 0,
    seconds: 0,
    totalSeconds: 0,
    percentage: 100,
  });

  useEffect(() => {
    const endTimeDate = new Date(endTime);
    const totalDuration = 3600; // Assuming 1 hour challenge duration, adjust as needed

    const updateTimer = () => {
      const now = new Date();
      const diff = Math.max(
        0,
        Math.floor((endTimeDate.getTime() - now.getTime()) / 1000)
      );

      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;
      const percentage = Math.min(
        100,
        Math.max(0, (diff / totalDuration) * 100)
      );

      setTimeLeft({
        hours,
        minutes,
        seconds,
        totalSeconds: diff,
        percentage,
      });

      if (diff <= 0) {
        onAutoEnd();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [endTime, onAutoEnd]);

  const getTimeColor = () => {
    if (timeLeft.totalSeconds < 300) return 'text-red-500'; // Less than 5 minutes
    if (timeLeft.totalSeconds < 900) return 'text-amber-500'; // Less than 15 minutes
    return 'text-emerald-500';
  };

  const getProgressColor = () => {
    if (timeLeft.percentage < 20) return 'bg-red-500';
    if (timeLeft.percentage < 50) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div
      className={cn(
        'h-16 border-b bg-background/80 backdrop-blur-sm',
        className
      )}
    >
      <div className="flex h-16 w-full items-center justify-between px-6">
        <div className="flex w-fit items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={onPrev}
            disabled={currentProblem === 1}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Problem</span>
            <Badge variant="secondary" className="px-2.5">
              {currentProblem}/{problemLength}
            </Badge>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={onNext}
            disabled={currentProblem === problemLength}
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-col items-center justify-center gap-2">
          <div className="flex items-center gap-1.5">
            <Clock className={cn('h-4 w-4', getTimeColor())} />
            <span
              className={cn('font-mono text-sm font-medium', getTimeColor())}
            >
              {String(timeLeft.hours).padStart(2, '0')}:
              {String(timeLeft.minutes).padStart(2, '0')}:
              {String(timeLeft.seconds).padStart(2, '0')}
            </span>
          </div>{' '}
          <Progress
            value={timeLeft.percentage}
            max={100}
            className="h-2 w-24 bg-muted"
            style={
              {
                '--progress-indicator-color': getProgressColor(),
              } as React.CSSProperties
            }
          />
        </div>

        <Button variant="destructive" onClick={onEnd}>
          <LogOut className="h-4 w-4" />
          End Challenge
        </Button>
      </div>
    </div>
  );
}
