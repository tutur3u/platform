import { HOUR_HEIGHT } from './config';
import { useEffect, useState } from 'react';

const TimeIndicatorLine = ({
  columnIndex,
  columnsCount,
}: {
  columnIndex: number;
  columnsCount: number;
}) => {
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
      className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[2px] bg-dynamic-light-red shadow-md"
      style={{
        transform: `translateY(${totalHours * HOUR_HEIGHT}px)`,
        transition: 'transform 0.3s ease-out',
        left: `${(columnIndex / columnsCount) * 100}%`,
        width: `calc(${(1 / columnsCount) * 100}% - 0.5rem)`,
      }}
    >
      {/* Left dot */}
      <div className="absolute -top-[4px] -left-[4px] h-[10px] w-[10px] rounded-full bg-dynamic-light-red shadow-md" />

      {/* Right dot */}
      {/* <div className="absolute -top-[4px] -right-[4px] h-[10px] w-[10px] rounded-full bg-dynamic-light-red shadow-md" /> */}
    </div>
  );
};

export default TimeIndicatorLine;
