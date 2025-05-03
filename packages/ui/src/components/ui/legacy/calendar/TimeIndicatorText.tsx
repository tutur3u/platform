import { HOUR_HEIGHT } from './config';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { useCalendar } from '../../../../hooks/use-calendar';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(timezone);

const TimeIndicatorText = ({ columnIndex }: { columnIndex: number }) => {
  const { settings } = useCalendar();
  const tz = settings?.timezone?.timezone || 'auto';
  const [now, setNow] = useState(dayjs());

  // Update the time every minute
  useEffect(() => {
    const updateTime = () => {
      setNow(dayjs());
    };

    // Update immediately
    updateTime();

    // Then update every minute
    const interval = setInterval(updateTime, 60000);

    return () => clearInterval(interval);
  }, []);

  // Use selected timezone
  const nowTz = tz === 'auto' ? now : now.tz(tz);
  const hours = nowTz.hour();
  const minutes = nowTz.minute();
  const seconds = nowTz.second();

  // Calculate total hours with decimal for precise positioning
  const totalHours = hours + minutes / 60 + seconds / 3600;

  // Format the current time
  const formattedTime = nowTz.format('h:mm a');

  // Only show the time indicator text for the first column (when columnIndex is 0)
  // This prevents duplicate time indicators when multiple days are visible
  if (columnIndex > 0) return null;

  return (
    <div
      className="pointer-events-none absolute -left-[70px] top-[-0.075rem] z-[100] flex items-center"
      style={{
        transform: `translateY(${totalHours * HOUR_HEIGHT - 10}px)`,
        transition: 'transform 0.3s ease-out',
      }}
    >
      <div className="bg-dynamic-light-red rounded-md px-2 py-1 text-xs font-semibold text-black">
        {formattedTime}
      </div>
      <div className="border-l-dynamic-light-red h-0 w-0 border-y-[6px] border-l-[6px] border-y-transparent" />
    </div>
  );
};

export default TimeIndicatorText;
