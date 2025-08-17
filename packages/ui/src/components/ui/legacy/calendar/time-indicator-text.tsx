import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { useEffect, useState } from 'react';
import { useCalendar } from '../../../../hooks/use-calendar';
import { HOUR_HEIGHT, TIME_INDICATOR_OFFSETS } from './config';

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
  const showSecondary =
    settings?.timezone?.showSecondaryTimezone && secondaryTz;
  const [now, setNow] = useState(tz === 'auto' ? dayjs() : dayjs().tz(tz));

  // Update the time every minute
  useEffect(() => {
    const updateTime = () => {
      setNow(tz === 'auto' ? dayjs() : dayjs().tz(tz));
    };

    // Update immediately
    updateTime();

    // Then update every minute
    const interval = setInterval(updateTime, 60000);

    return () => clearInterval(interval);
  }, [tz]);

  // Use selected timezone
  const nowTz = tz === 'auto' ? now : now.tz(tz);
  const timeFormat = settings?.appearance?.timeFormat;

  // Get time details using helper function
  const { totalHours, formattedTime } = getTimeDetails(nowTz, timeFormat);

  // Only show the time indicator text for the first column (when columnIndex is 0)
  // This prevents duplicate time indicators when multiple days are visible
  if (columnIndex > 0) return null;

  // Calculate positioning based on whether secondary timezone is shown
  const leftOffset = showSecondary
    ? TIME_INDICATOR_OFFSETS.DUAL_TIMEZONE
    : TIME_INDICATOR_OFFSETS.SINGLE_TIMEZONE;

  return (
    <div
      className="pointer-events-none absolute top-[-0.075rem] z-100 flex items-center"
      style={{
        left: `${leftOffset}px`,
        transform: `translateY(${totalHours * HOUR_HEIGHT - 10}px)`,
        transition: 'transform 0.3s ease-out',
      }}
    >
      <div className="rounded-md bg-dynamic-light-red px-2 py-1 font-semibold text-black text-xs">
        {formattedTime}
      </div>
      <div className="h-0 w-0 border-y-[6px] border-y-transparent border-l-[6px] border-l-dynamic-light-red" />
    </div>
  );
};
