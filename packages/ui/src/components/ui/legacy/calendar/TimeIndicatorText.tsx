import { format } from 'date-fns';
import { useEffect, useState } from 'react';

// Constants for grid calculations
const HOUR_HEIGHT = 80; // Height of one hour in pixels

const TimeIndicatorText = () => {
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

  return (
    <div
      className="pointer-events-none absolute top-[-0.075rem] -left-[60px] z-[100] flex items-center"
      style={{
        transform: `translateY(${totalHours * HOUR_HEIGHT - 10}px)`,
        transition: 'transform 0.3s ease-out',
      }}
    >
      <div className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground shadow-sm">
        {formattedTime}
      </div>
      <div className="h-0 w-0 border-y-4 border-l-4 border-y-transparent border-l-primary" />
    </div>
  );
};

export default TimeIndicatorText;
