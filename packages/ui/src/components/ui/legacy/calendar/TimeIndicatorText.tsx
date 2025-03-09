import { HOUR_HEIGHT } from './config';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';

const TimeIndicatorText = ({ columnIndex }: { columnIndex: number }) => {
  const [now, setNow] = useState(new Date());

  // Update the time every minute
  useEffect(() => {
    const updateTime = () => {
      setNow(new Date());
    };

    // Update immediately
    updateTime();

    // Then update every minute
    const interval = setInterval(updateTime, 60000);

    return () => clearInterval(interval);
  }, []);

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  // Calculate total hours with decimal for precise positioning
  const totalHours = hours + minutes / 60 + seconds / 3600;

  // Format the current time
  const formattedTime = format(now, 'h:mm a');

  // Only show the time indicator text for the first column (when columnIndex is 0)
  // This prevents duplicate time indicators when multiple days are visible
  if (columnIndex > 0) return null;

  return (
    <div
      className="pointer-events-none absolute top-[-0.075rem] -left-[70px] z-[100] flex items-center"
      style={{
        transform: `translateY(${totalHours * HOUR_HEIGHT - 10}px)`,
        transition: 'transform 0.3s ease-out',
      }}
    >
      <div className="rounded-md bg-dynamic-light-red px-2 py-1 text-xs font-semibold text-black">
        {formattedTime}
      </div>
      <div className="h-0 w-0 border-y-[6px] border-l-[6px] border-y-transparent border-l-dynamic-light-red" />
    </div>
  );
};

export default TimeIndicatorText;
