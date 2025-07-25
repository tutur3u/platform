import DayPlanner from './day-planner';
import { useTimeBlocking } from './time-blocking-provider';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';

export default function DayPlanners({
  timeblocks,
  dateRanges,
  editable,
  disabled,
  showBestTimes = false,
  onBestTimesStatusByDateAction,
}: {
  timeblocks: Timeblock[];
  dateRanges: { date: string; localStart: Date; localEnd: Date }[];
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

  // Compute global max availability across all days
  const hourSplits = 4;
  let globalMaxAvailable = 0;
  dateRanges.forEach(({ date, localStart, localEnd }) => {
    const dayTimeblocks = timeblocks.filter((tb) => tb.date === date);
    const startHour = localStart.getHours();
    const endHour = localEnd.getHours();
    const hourBlocks = Array.from(
      Array(Math.floor(endHour + 1 - startHour)).keys()
    );
    const slotAvailableCounts: number[] = hourBlocks
      .map((i) => (i + startHour) * hourSplits)
      .flatMap((i) => Array(hourSplits).fill(i))
      .map((_, i) => {
        const currentDate = dayjs(localStart)
          .hour(Math.floor(i / hourSplits) + startHour)
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
      {dateRanges.map(({ date, localStart, localEnd }) => (
        <DayPlanner
          key={date}
          date={date}
          localStart={localStart}
          localEnd={localEnd}
          editable={editable}
          disabled={disabled}
          timeblocks={timeblocks.filter((tb) => tb.date === date)}
          showBestTimes={showBestTimes}
          globalMaxAvailable={globalMaxAvailable}
          onBestTimesStatus={(hasBestTimes) =>
            handleBestTimesStatus(date, hasBestTimes)
          }
        />
      ))}
    </div>
  );
}
