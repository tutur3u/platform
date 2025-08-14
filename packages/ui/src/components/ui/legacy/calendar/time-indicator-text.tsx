import { HOUR_HEIGHT } from './config';
import { useCalendarSettings } from './settings/settings-context';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { useEffect, useState } from 'react';

dayjs.extend(timezone);

export const TimeIndicatorText = ({ columnIndex }: { columnIndex: number }) => {
  const { settings } = useCalendarSettings();
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

  // Use selected timezone for primary
  const nowTz = tz === 'auto' ? now : now.tz(tz);
  const hours = nowTz.hour();
  const minutes = nowTz.minute();
  const seconds = nowTz.second();

  // Calculate total hours with decimal for precise positioning
  const totalHours = hours + minutes / 60 + seconds / 3600;

  // Format the current time for primary timezone
  const formattedTime = nowTz.format(
    settings?.appearance?.timeFormat === '24h' ? 'HH:mm' : 'h:mm a'
  );

  // Secondary timezone time
  let secondaryFormattedTime = '';
  let secondaryTotalHours = 0;
  if (showSecondary && secondaryTz) {
    const secondaryNow = now.tz(secondaryTz);
    const secHours = secondaryNow.hour();
    const secMinutes = secondaryNow.minute();
    const secSeconds = secondaryNow.second();
    secondaryTotalHours = secHours + secMinutes / 60 + secSeconds / 3600;
    secondaryFormattedTime = secondaryNow.format(
      settings?.appearance?.timeFormat === '24h' ? 'HH:mm' : 'h:mm a'
    );
  }

  // Only show the time indicator text for the first column (when columnIndex is 0)
  // This prevents duplicate time indicators when multiple days are visible
  if (columnIndex > 0) return null;

  // Calculate positioning based on whether secondary timezone is shown
  const leftOffset = showSecondary ? -134 : -70; // Adjust for dual timezone layout

  return (
    <>
      {/* Secondary timezone indicator (shows on left when enabled) */}
      {showSecondary && (
        <div
          className="pointer-events-none absolute top-[-0.075rem] z-100 flex items-center"
          style={{
            left: '-70px',
            transform: `translateY(${secondaryTotalHours * HOUR_HEIGHT - 10}px)`,
            transition: 'transform 0.3s ease-out',
          }}
        >
          <div className="rounded-md bg-blue-500/80 px-2 py-1 text-xs font-semibold text-white shadow-sm">
            {secondaryFormattedTime}
          </div>
          <div className="h-0 w-0 border-y-[6px] border-l-[6px] border-y-transparent border-l-blue-500/80" />
        </div>
      )}

      {/* Primary timezone indicator */}
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
    </>
  );
};
