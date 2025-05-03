import { useCalendar } from '../../../../hooks/use-calendar';
import { HOUR_HEIGHT } from './config';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { useEffect, useState } from 'react';

dayjs.extend(timezone);

const TimeIndicatorLine = ({
  columnIndex,
  columnsCount,
}: {
  columnIndex: number;
  columnsCount: number;
}) => {
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

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[2px] bg-red-400 shadow-md"
      style={{
        transform: `translateY(${totalHours * HOUR_HEIGHT}px)`,
        transition: 'transform 0.3s ease-out',
        left: `${(columnIndex / columnsCount) * 100}%`,
        width: `calc(${(1 / columnsCount) * 100}% - 0.5rem)`,
      }}
    >
      {/* Left dot */}
      <div className="absolute -left-[4px] -top-[4px] h-[10px] w-[10px] rounded-full bg-red-400 shadow-md" />

      {/* Right dot */}
      {/* <div className="absolute -top-[4px] -right-[4px] h-[10px] w-[10px] rounded-full bg-red-400 shadow-md" /> */}
    </div>
  );
};

export default TimeIndicatorLine;
