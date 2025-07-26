'use client';

import DayPlanners from './day-planners';
import { useTimeBlocking } from './time-blocking-provider';
import TimeColumn from './time-column';
import { combineDateAndTimetzToLocal, timetzToHour } from '@/utils/date-helper';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import dayjs from 'dayjs';

export default function DatePlanner({
  timeblocks,
  dates,
  start,
  end,
  editable = false,
  disabled = false,
  showBestTimes = false,
  onBestTimesStatusByDateAction,
}: {
  timeblocks: Timeblock[];
  dates?: string[];
  start?: string;
  end?: string;
  editable?: boolean;
  disabled?: boolean;
  showBestTimes?: boolean;
  onBestTimesStatusByDateAction?: (status: Record<string, boolean>) => void;
}) {
  const { user, editing, endEditing, setPreviewDate } = useTimeBlocking();

  const startHour = timetzToHour(start);
  const endHour = timetzToHour(end);

  if (!dates || !start || !end) return null;

  // Compute local start and end datetimes for each date
  let localDateRanges = dates.map((date) => ({
    date,
    localStart: combineDateAndTimetzToLocal(date, start),
    localEnd: combineDateAndTimetzToLocal(date, end),
  }));

  // If the plan crosses midnight, add an extra date for the next day
  if (startHour > endHour) {
    localDateRanges = localDateRanges.flatMap(
      ({ date, localStart, localEnd }) => {
        const nextDay = dayjs(date).add(1, 'day').format('YYYY-MM-DD');
        return [
          {
            date,
            localStart,
            localEnd: dayjs(localStart).hour(23).minute(59).second(59).toDate(),
          },
          {
            date: nextDay,
            localStart: dayjs(localEnd).hour(0).minute(0).second(0).toDate(),
            localEnd,
          },
        ];
      }
    );
  }

  return (
    <div
      onMouseUp={
        editable
          ? (e) => {
              e.preventDefault();
              endEditing();
            }
          : undefined
      }
      onMouseLeave={
        editable
          ? (e) => {
              e.preventDefault();
              endEditing();
            }
          : undefined
      }
      onTouchEnd={
        editable
          ? () => {
              if (!editing.enabled) return;
              endEditing();
            }
          : undefined
      }
      className="mt-4 flex items-start justify-center gap-2"
    >
      <TimeColumn
        id={editable ? 'self' : 'group'}
        start={startHour!}
        end={endHour!}
        className="flex-initial"
      />

      {dates && (
        <div
          className="flex flex-col items-start justify-start gap-4 overflow-x-auto"
          onMouseLeave={
            editable
              ? undefined
              : (e) => {
                  e.preventDefault();
                  setPreviewDate(null);
                }
          }
        >
          <DayPlanners
            timeblocks={timeblocks}
            dateRanges={localDateRanges}
            editable={editable}
            disabled={editable ? (user ? disabled : true) : disabled}
            showBestTimes={showBestTimes}
            onBestTimesStatusByDateAction={onBestTimesStatusByDateAction}
          />
        </div>
      )}
    </div>
  );
}
