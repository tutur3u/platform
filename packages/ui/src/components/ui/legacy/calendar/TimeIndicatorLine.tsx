import { useEffect, useState } from 'react';

// Constants for grid calculations
const HOUR_HEIGHT = 80; // Height of one hour in pixels

const TimeIndicatorLine = () => {
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

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-50 h-[2px] bg-primary shadow-sm"
      style={{
        transform: `translateY(${totalHours * HOUR_HEIGHT}px)`,
        transition: 'transform 0.3s ease-out',
      }}
    >
      <div className="absolute -top-[4px] -left-[4px] h-[10px] w-[10px] animate-pulse rounded-full bg-primary" />
      <div className="absolute -top-[4px] -right-[4px] h-[10px] w-[10px] animate-pulse rounded-full bg-primary" />
    </div>
  );
};

export default TimeIndicatorLine;
