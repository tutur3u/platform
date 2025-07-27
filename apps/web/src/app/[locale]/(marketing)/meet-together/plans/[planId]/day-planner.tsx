import DayTime from './day-time';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { useLocale } from 'next-intl';

export default function DayPlanner({
  timeblocks,
  date,
  localStart,
  localEnd,
  editable,
  disabled,
  showBestTimes = false,
  globalMaxAvailable,
  onBestTimesStatus,
  startHour,
  endHour,
}: {
  timeblocks: Timeblock[];
  date: string;
  localStart: Date;
  localEnd: Date;
  editable: boolean;
  disabled: boolean;
  showBestTimes?: boolean;
  globalMaxAvailable: number;
  onBestTimesStatus?: (hasBestTimes: boolean) => void;
  startHour?: number;
  endHour?: number;
}) {
  const locale = useLocale();
  dayjs.locale(locale);

  // Use the actual local start and end hours from the Date objects
  const actualStartHour = localStart.getHours();
  const actualEndHour = localEnd.getHours();

  // Check if this is a full day range (00:00 to 23:59)
  const isFullDay =
    actualStartHour === 0 &&
    (actualEndHour === 23 || dayjs(localEnd).minute() === 59);

  // Check if this consolidated range crosses midnight (but isn't a full day)
  const crossesMidnight = !isFullDay && actualStartHour > actualEndHour;

  // Filter timeblocks to only include those that match this specific date
  const dateSpecificTimeblocks = timeblocks.filter((tb) => {
    // Check if the timeblock's date matches this date range
    const tbStart = dayjs(`${tb.date} ${tb.start_time}`);
    const tbEnd = dayjs(`${tb.date} ${tb.end_time}`);
    const rangeStart = dayjs(localStart);
    const rangeEnd = dayjs(localEnd);

    // Include timeblock if it overlaps with this date range
    return tbStart.isBefore(rangeEnd) && tbEnd.isAfter(rangeStart);
  });

  return (
    <div>
      <div className="pointer-events-none p-1 select-none">
        <div className="line-clamp-1 text-xs">
          {dayjs(date)
            .locale(locale)
            .format(locale === 'vi' ? 'DD/MM' : 'MMM D')}
        </div>
        <div className="font-semibold">
          {dayjs(date).locale(locale).format('ddd')}
        </div>
      </div>

      {isFullDay ? (
        // Handle full day ranges (00:00 to 23:59)
        <DayTime
          timeblocks={dateSpecificTimeblocks}
          date={date}
          start={0}
          end={23}
          editable={editable}
          disabled={disabled}
          showBestTimes={showBestTimes}
          globalMaxAvailable={globalMaxAvailable}
          onBestTimesStatus={onBestTimesStatus}
        />
      ) : crossesMidnight ? (
        // Handle consolidated ranges that cross midnight (e.g., 9pm-5am)
        <div className="relative">
          {/* First part: from start hour to 23:59 */}
          <DayTime
            timeblocks={dateSpecificTimeblocks}
            date={date}
            start={actualStartHour}
            end={23}
            editable={editable}
            disabled={disabled}
            showBestTimes={showBestTimes}
            globalMaxAvailable={globalMaxAvailable}
            onBestTimesStatus={onBestTimesStatus}
          />

          {/* Separator for the gap */}
          <div className="relative flex h-6 w-14 items-center justify-center border-l border-foreground/50 bg-foreground/5">
            <div className="rotate-90 text-xs whitespace-nowrap text-foreground/60">
              ···
            </div>
          </div>

          {/* Second part: from 00:00 to end hour */}
          <DayTime
            timeblocks={dateSpecificTimeblocks}
            date={date}
            start={0}
            end={actualEndHour}
            editable={editable}
            disabled={disabled}
            showBestTimes={showBestTimes}
            globalMaxAvailable={globalMaxAvailable}
            onBestTimesStatus={onBestTimesStatus}
          />
        </div>
      ) : (
        // Normal case: single time range that doesn't cross midnight
        <DayTime
          timeblocks={dateSpecificTimeblocks}
          date={date}
          start={actualStartHour}
          end={actualEndHour}
          editable={editable}
          disabled={disabled}
          showBestTimes={showBestTimes}
          globalMaxAvailable={globalMaxAvailable}
          onBestTimesStatus={onBestTimesStatus}
        />
      )}
    </div>
  );
}
