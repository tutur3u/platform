import DayPlanner from './day-planner';
import { useTimeBlocking } from './time-blocking-provider';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { useEffect, useState } from 'react';

export default function DayPlanners({
  timeblocks,
  dates,
  start,
  end,
  editable,
  disabled,
  showBestTimes = false,
  onBestTimesStatusByDateAction,
}: {
  timeblocks: Timeblock[];
  dates: string[];
  start: number;
  end: number;
  editable: boolean;
  disabled: boolean;
  showBestTimes?: boolean;
  onBestTimesStatusByDateAction?: (status: Record<string, boolean>) => void;
}) {
  const { editing } = useTimeBlocking();

  const [bestTimesStatus, setBestTimesStatus] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (onBestTimesStatusByDateAction) {
      onBestTimesStatusByDateAction(bestTimesStatus);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(bestTimesStatus)]);

  function handleBestTimesStatus(date: string, hasBestTimes: boolean) {
    setBestTimesStatus((prev) => {
      if (prev[date] === hasBestTimes) return prev;
      return { ...prev, [date]: hasBestTimes };
    });
  }

  function preventScroll(e: any) {
    e.preventDefault();
    return false;
  }

  useEffect(() => {
    const scrollableDiv = document?.querySelector('#scrollable');

    if (!editing.enabled) {
      scrollableDiv?.removeEventListener('wheel', preventScroll);
      scrollableDiv?.removeEventListener('touchmove', preventScroll);
      return;
    }

    scrollableDiv?.addEventListener('wheel', preventScroll, { passive: false });
    scrollableDiv?.addEventListener('touchmove', preventScroll, {
      passive: false,
    });

    return () => {
      scrollableDiv?.removeEventListener('wheel', preventScroll);
      scrollableDiv?.removeEventListener('touchmove', preventScroll);
    };
  }, [editing.enabled]);

  return (
    <div
      id="scrollable"
      className="relative flex flex-1 items-start justify-center gap-2 overflow-x-auto"
    >
      {dates.map((d) => (
        <DayPlanner
          key={d}
          date={d}
          start={start}
          end={end}
          editable={editable}
          disabled={disabled}
          timeblocks={timeblocks.filter((tb) => tb.date === d)}
          showBestTimes={showBestTimes}
          onBestTimesStatus={(hasBestTimes) =>
            handleBestTimesStatus(d, hasBestTimes)
          }
        />
      ))}
    </div>
  );
}
