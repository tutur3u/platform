import DayPlanner from './day-planner';
import { useTimeBlocking } from './time-blocking-provider';
import { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { useEffect } from 'react';

export default function DayPlanners({
  timeblocks,
  dates,
  start,
  end,
  editable,
  disabled,
}: {
  timeblocks: Timeblock[];
  dates: string[];
  start: number;
  end: number;
  editable: boolean;
  disabled: boolean;
}) {
  const { editing } = useTimeBlocking();

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
        />
      ))}
    </div>
  );
}
