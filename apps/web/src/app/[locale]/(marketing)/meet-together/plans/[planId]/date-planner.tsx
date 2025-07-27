'use client';

import DayPlanners from './day-planners';
import { useTimeBlocking } from './time-blocking-provider';
import TimeColumn from './time-column';
import TimezoneAwareTimeColumn from './timezone-aware-time-column';
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
  showLocalTime = false,
  onBestTimesStatusByDateAction,
}: {
  timeblocks: Timeblock[];
  dates?: string[];
  start?: string;
  end?: string;
  editable?: boolean;
  disabled?: boolean;
  showBestTimes?: boolean;
  showLocalTime?: boolean;
  onBestTimesStatusByDateAction?: (status: Record<string, boolean>) => void;
}) {
  const { user, editing, endEditing, setPreviewDate } = useTimeBlocking();

  const startHour = timetzToHour(start);
  const endHour = timetzToHour(end);

  if (
    !dates ||
    !start ||
    !end ||
    typeof startHour !== 'number' ||
    typeof endHour !== 'number'
  )
    return null;

  // Compute local start and end datetimes for each date, handling timezone boundary crossings
  const tempDateRanges: { date: string; localStart: Date; localEnd: Date }[] =
    [];

  for (const planDate of dates) {
    const localStart = combineDateAndTimetzToLocal(planDate, start);
    const localEnd = combineDateAndTimetzToLocal(planDate, end);

    // Get the actual local dates for start and end times
    const startDateStr = dayjs(localStart).format('YYYY-MM-DD');
    const endDateStr = dayjs(localEnd).format('YYYY-MM-DD');

    if (startDateStr === endDateStr) {
      // Same day - no timezone boundary crossing
      tempDateRanges.push({
        date: startDateStr,
        localStart,
        localEnd,
      });
    } else {
      // Different days - timezone boundary crossing
      // First day: from start time to end of day
      tempDateRanges.push({
        date: startDateStr,
        localStart,
        localEnd: dayjs(startDateStr).endOf('day').toDate(),
      });

      // Second day: from start of day to end time
      tempDateRanges.push({
        date: endDateStr,
        localStart: dayjs(endDateStr).startOf('day').toDate(),
        localEnd,
      });
    }
  }

  // Consolidate date ranges that fall on the same local date
  const dateRangeMap = new Map<
    string,
    { date: string; localStart: Date; localEnd: Date }
  >();

  for (const range of tempDateRanges) {
    const existingRange = dateRangeMap.get(range.date);

    if (existingRange) {
      // Merge with existing range - extend the time range
      const earliestStart = dayjs(range.localStart).isBefore(
        existingRange.localStart
      )
        ? range.localStart
        : existingRange.localStart;
      const latestEnd = dayjs(range.localEnd).isAfter(existingRange.localEnd)
        ? range.localEnd
        : existingRange.localEnd;

      dateRangeMap.set(range.date, {
        date: range.date,
        localStart: earliestStart,
        localEnd: latestEnd,
      });
    } else {
      dateRangeMap.set(range.date, range);
    }
  }

  // Convert map back to array and sort by date
  const localDateRanges = Array.from(dateRangeMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // Calculate the overall time range for the time column
  const allLocalStarts = localDateRanges.map((range) => range.localStart);
  const allLocalEnds = localDateRanges.map((range) => range.localEnd);
  const overallStart = new Date(
    Math.min(...allLocalStarts.map((d) => d.getTime()))
  );
  const overallEnd = new Date(
    Math.max(...allLocalEnds.map((d) => d.getTime()))
  );

  const overallStartHour = overallStart.getHours();
  const overallEndHour = overallEnd.getHours();

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Interactive only when editable
    <div
      role={editable ? 'button' : undefined}
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
      {showLocalTime ? (
        // Show single timezone-aware time column (like original TimeColumn)
        <TimezoneAwareTimeColumn
          id={editable ? 'self' : 'group'}
          start={start}
          end={end}
          date={dates?.[0] || ''} // Use first date for timezone conversion
          className="flex-initial"
        />
      ) : (
        // Show regular time column using the overall time range
        <TimeColumn
          id={editable ? 'self' : 'group'}
          start={overallStartHour}
          end={overallEndHour}
          className="flex-initial"
        />
      )}

      {localDateRanges.length > 0 && (
        // biome-ignore lint/a11y/noStaticElementInteractions: Interactive only when not editable
        <div
          role={editable ? undefined : 'button'}
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
