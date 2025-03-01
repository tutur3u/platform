import CountdownTimer from './countdown-timer';
import ProblemChanger from './problem-changer';
import NavbarSeparator from '@/app/[locale]/(marketing)/navbar-separator';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { Suspense } from 'react';

interface Props {
  proNum: number;
  currentProblem: number;
  challengeId: string;
  onNext: () => void;
  onPrev: () => void;
  onEnd: () => void;
  startTime: string | null;
  endTime: string | null;
  duration: number;
}

export default function CustomizedHeader({
  proNum,
  currentProblem,
  challengeId,
  onNext,
  onPrev,
  onEnd,
  startTime,
  endTime,
  duration,
}: Props) {
  return (
    <nav
      id="navbar"
      className={cn('bg-foreground/2 absolute inset-x-0 top-0 z-50 shadow-sm')}
    >
      <div className="container mx-auto px-4 py-2 font-semibold">
        <div className="flex items-center justify-between">
          <div className="flex flex-1 items-center justify-center">
            <ProblemChanger
              onPrev={onPrev}
              onNext={onNext}
              currentProblem={currentProblem}
              proNum={proNum}
            />
          </div>

          <div className="flex items-center gap-4">
            <Suspense
              fallback={
                <div className="bg-foreground/5 h-10 w-[88px] animate-pulse rounded-lg" />
              }
            >
              <CountdownTimer
                challengeId={challengeId}
                startTime={startTime}
                endTime={endTime}
                duration={duration}
              />
              <Button className="bg-red-500 hover:bg-red-700" onClick={onEnd}>
                End Test
              </Button>
            </Suspense>
          </div>
        </div>
      </div>
      <NavbarSeparator />
    </nav>
  );
}
