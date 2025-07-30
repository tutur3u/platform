import DayPlanner from './day-planner';
import { useTimeBlocking } from './time-blocking-provider';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';

export default function DayPlanners({
  timeblocks,
  dates,
  start,
  end,
  editable,
  disabled,
  showBestTimes = false,
  tentativeMode = false,
  onBestTimesStatusByDateAction,
}: {
  timeblocks: Timeblock[];
  dates: string[];
  start: number;
  end: number;
  editable: boolean;
  disabled: boolean;
  showBestTimes?: boolean;
  tentativeMode?: boolean;
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
  }, [bestTimesStatus, onBestTimesStatusByDateAction]);

  const handleBestTimesStatus = useCallback(
    (date: string, hasBestTimes: boolean) => {
      setBestTimesStatus((prev) => {
        if (prev[date] === hasBestTimes) return prev;
        return { ...prev, [date]: hasBestTimes };
      });
    },
    []
  );

  function preventScroll(e: Event) {
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

  // Compute global max availability across all days
  const hourSplits = 4;
  let globalMaxAvailable = 0;
  dates.forEach((d) => {
    const dayTimeblocks = timeblocks.filter((tb) => tb.date === d);
    const hourBlocks = Array.from(Array(Math.floor(end + 1 - start)).keys());
    const slotAvailableCounts: number[] = hourBlocks
      .map((i) => (i + start) * hourSplits)
      .flatMap((i) => Array(hourSplits).fill(i))
      .map((_, i) => {
        const currentDate = dayjs(d)
          .hour(Math.floor(i / hourSplits) + start)
          .minute((i % hourSplits) * 15)
          .toDate();
        const userIds = dayTimeblocks
          .filter((tb) => {
            const start = dayjs(`${tb.date} ${tb.start_time}`);
            const end = dayjs(`${tb.date} ${tb.end_time}`);
            return dayjs(currentDate).isBetween(start, end, null, '[)');
          })
          .map((tb) => tb.user_id)
          .filter(Boolean);
        const uniqueUserIds = Array.from(new Set(userIds));
        return uniqueUserIds.length;
      });
    const maxAvailable = Math.max(...slotAvailableCounts);
    if (maxAvailable > globalMaxAvailable) globalMaxAvailable = maxAvailable;
  });

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
          tentativeMode={tentativeMode}
          globalMaxAvailable={globalMaxAvailable}
          onBestTimesStatus={(hasBestTimes) =>
            handleBestTimesStatus(d, hasBestTimes)
          }
        />
      ))}
    </div>
  );
}
