import { ChallengeCriteriaDialog } from './challenge-criteria-dialog';
import { NovaChallenge, NovaChallengeCriteria } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ListChecks,
  LogOut,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useEffect, useRef, useState } from 'react';

type ExtendedNovaChallenge = NovaChallenge & {
  criteria: NovaChallengeCriteria[];
  problems: {
    id: string;
    title: string;
  }[];
};

interface Props {
  challenge: ExtendedNovaChallenge;
  currentProblemIndex: number;
  startTime: string;
  endTime: string;
  onPrev: () => void;
  onNext: () => void;
  onChange: (problemId: string) => void;
  onEnd: () => void;
  onAutoEnd: () => void;
}

export default function ChallengeHeader({
  challenge,
  currentProblemIndex,
  startTime,
  endTime,
  onPrev,
  onNext,
  onChange,
  onEnd,
  onAutoEnd,
}: Props) {
  // Static timer ID to ensure we don't create multiple timers
  const timerId = useRef<NodeJS.Timeout | null>(null);

  // Store the timer configuration in a ref to prevent resets on re-renders
  const timerConfig = useRef({
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    initialized: false,
  });

  // State for displaying the timer
  const [timeLeft, setTimeLeft] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0,
    totalSeconds: 0,
    percentage: 100,
  });

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Initialize the timer once and handle cleanup
  useEffect(() => {
    // Only initialize once to prevent timer resets
    if (!timerConfig.current.initialized) {
      // Validate dates
      const isEndTimeValid = !isNaN(timerConfig.current.endTime.getTime());
      const isStartTimeValid = !isNaN(timerConfig.current.startTime.getTime());

      // Use defaults if invalid
      if (!isEndTimeValid) {
        timerConfig.current.endTime = new Date(Date.now() + 3600 * 1000);
      }

      if (!isStartTimeValid) {
        timerConfig.current.startTime = new Date();
      }

      // Mark as initialized
      timerConfig.current.initialized = true;
    }

    // Calculate total duration in seconds
    const totalDuration = Math.max(
      1,
      Math.floor(
        (timerConfig.current.endTime.getTime() -
          timerConfig.current.startTime.getTime()) /
          1000
      )
    );

    // Timer update function
    const updateTimer = () => {
      const now = new Date();
      const diff = Math.max(
        0,
        Math.floor(
          (timerConfig.current.endTime.getTime() - now.getTime()) / 1000
        )
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

      // Auto-end when time is up
      if (diff <= 0 && onAutoEnd) {
        onAutoEnd();
      }
    };

    // Run immediately
    updateTimer();

    // Clear any existing interval
    if (timerId.current) {
      clearInterval(timerId.current);
    }

    // Set up the interval
    timerId.current = setInterval(updateTimer, 1000);

    // Cleanup on unmount
    return () => {
      if (timerId.current) {
        clearInterval(timerId.current);
        timerId.current = null;
      }
    };
  }, []);

  const getTimeColor = () => {
    if (timeLeft.totalSeconds < 300) return 'text-red-500'; // Less than 5 minutes
    if (timeLeft.totalSeconds < 900) return 'text-amber-500'; // Less than 15 minutes
    return 'text-emerald-500';
  };

  const getProgressColor = () => {
    if (timeLeft.totalSeconds < 300) return 'bg-red-500';
    if (timeLeft.totalSeconds < 900) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div className="relative flex h-16 items-center justify-between border-b px-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={onPrev}
            disabled={currentProblemIndex === 1}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="flex min-w-36 items-center gap-1.5"
              >
                <span className="font-medium">Problem</span>
                <Badge variant="secondary" className="px-2.5">
                  {currentProblemIndex}/{challenge.problems.length}
                </Badge>
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-60 max-w-72 overflow-y-auto"
            >
              {challenge.problems.map((problem, index) => (
                <DropdownMenuItem
                  key={problem.id}
                  className={cn(
                    'gap-2',
                    index + 1 === currentProblemIndex &&
                      'bg-accent text-accent-foreground'
                  )}
                  onClick={() => onChange(problem.id)}
                >
                  <Badge variant="outline" className="px-2 py-0 text-xs">
                    {index + 1}
                  </Badge>
                  <span className="truncate">{problem.title}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="icon"
            onClick={onNext}
            disabled={currentProblemIndex === challenge.problems.length}
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <ChallengeCriteriaDialog
          trigger={
            <Button variant="outline" size="sm">
              <ListChecks className="h-4 w-4" />
              <span className="hidden xl:block">View challenge criteria</span>
            </Button>
          }
          criteria={challenge.criteria}
        />
      </div>

      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-2">
        <div className="flex items-center gap-1.5">
          <Clock className={cn('h-4 w-4', getTimeColor())} />
          <span className={cn('font-mono text-sm font-medium', getTimeColor())}>
            {String(timeLeft.hours).padStart(2, '0')}:
            {String(timeLeft.minutes).padStart(2, '0')}:
            {String(timeLeft.seconds).padStart(2, '0')}
          </span>
        </div>{' '}
        <Progress
          value={timeLeft.percentage}
          className="h-2 w-24"
          indicatorClassName={getProgressColor()}
        />
      </div>

      <Button variant="destructive" onClick={onEnd}>
        <LogOut className="h-4 w-4" />
        End Challenge
      </Button>
    </div>
  );
}
