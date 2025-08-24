import { useCalendar } from '../../../../hooks/use-calendar';
import { HOUR_HEIGHT, TIME_INDICATOR_OFFSETS } from './config';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useEffect, useState } from 'react';

dayjs.extend(utc);
dayjs.extend(timezone);

// Helper function to calculate time details
const getTimeDetails = (
  time: dayjs.Dayjs,
  timeFormat: '24h' | '12h' | undefined
) => {
  const hours = time.hour();
  const minutes = time.minute();
  const seconds = time.second();
  const totalHours = hours + minutes / 60 + seconds / 3600;
  const formattedTime = time.format(timeFormat === '24h' ? 'HH:mm' : 'h:mm a');
  return { totalHours, formattedTime };
};

export const TimeIndicatorText = ({ columnIndex }: { columnIndex: number }) => {
  const { settings } = useCalendar();
  const tz = settings?.timezone?.timezone;
  const secondaryTz = settings?.timezone?.secondaryTimezone;
  const showSecondary = Boolean(
    settings?.timezone?.showSecondaryTimezone && secondaryTz
  );
  const [now, setNow] = useState(
    !tz || tz === 'auto' ? dayjs() : dayjs().tz(tz)
  );

  // Update the time every minute, aligned to minute boundaries
  useEffect(() => {
    const updateTime = () => {
      setNow(!tz || tz === 'auto' ? dayjs() : dayjs().tz(tz));
    };

    // Update immediately
    updateTime();

    // Then align to minute boundary, and update every minute
    let interval: ReturnType<typeof setInterval> | null = null;
    const msToNextMinute = 60000 - (dayjs().valueOf() % 60000);
    const timeout = setTimeout(() => {
      updateTime();
      interval = setInterval(updateTime, 60000);
    }, msToNextMinute);

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [tz]);

  // Use selected timezone
  const nowTz = !tz || tz === 'auto' ? now : now.tz(tz);
  const timeFormat = settings?.appearance?.timeFormat;

  // Get time details using helper function
  const { totalHours, formattedTime } = getTimeDetails(nowTz, timeFormat);

  // Get secondary timezone time if enabled
  const formattedTimeSecondary =
    showSecondary && secondaryTz
      ? getTimeDetails(now.tz(secondaryTz), timeFormat).formattedTime
      : '';

  // Only show the time indicator text for the first column (when columnIndex is 0)
  // This prevents duplicate time indicators when multiple days are visible
  if (columnIndex > 0) return null;

  // Calculate positioning based on whether secondary timezone is shown
  const leftOffset = showSecondary
    ? TIME_INDICATOR_OFFSETS.DUAL_TIMEZONE
    : TIME_INDICATOR_OFFSETS.SINGLE_TIMEZONE;

  // In dual mode, the secondary indicator sits one time-column further left
  const secondaryLeftOffset =
    leftOffset -
    (TIME_INDICATOR_OFFSETS.SINGLE_TIMEZONE -
      TIME_INDICATOR_OFFSETS.DUAL_TIMEZONE);

  return (
    <>
      {/* Primary time indicator (red) */}
      <div
        className="pointer-events-none absolute top-[-0.075rem] z-100 flex items-center"
        style={{
          left: `${leftOffset}px`,
          transform: `translateY(${totalHours * HOUR_HEIGHT - 10}px)`,
          transition: 'transform 0.3s ease-out',
        }}
      >
        <div className="rounded-md bg-dynamic-light-red px-2 py-1 text-xs font-semibold text-black">
          {formattedTime}
        </div>
        <div className="h-0 w-0 border-y-[6px] border-l-[6px] border-y-transparent border-l-dynamic-light-red" />
      </div>

      {/* Secondary time indicator (blue) - when secondary timezone is enabled */}
      {showSecondary && (
        <div
          className="pointer-events-none absolute top-[-0.075rem] z-100 flex items-center"
          style={{
            left: `${secondaryLeftOffset}px`,
            transform: `translateY(${totalHours * HOUR_HEIGHT - 10}px)`,
            transition: 'transform 0.3s ease-out',
          }}
        >
          <div className="rounded-md bg-dynamic-light-blue px-2 py-1 text-xs font-semibold text-white">
            {formattedTimeSecondary}
          </div>
          <div className="h-0 w-0 border-y-[6px] border-l-[6px] border-y-transparent border-l-dynamic-light-blue" />
        </div>
      )}
    </>
  );
};
