import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';

const TimeTrail = () => {
  // Only show hours (not every half hour)
  const hours = Array.from(Array(24).keys());

  // Format time for display - only show hour
  const formatTime = (hour: number) => {
    const date = new Date();
    date.setHours(hour, 0, 0, 0);
    return format(date, 'h a'); // Just show hour and am/pm
  };

  return (
    <div
      className="relative w-16 border-r border-border dark:border-zinc-800"
      style={{ height: '1920px' }} // 24 hours * 80px = 1920px
    >
      {hours.map((hour) => (
        <div
          key={`trail-hour-${hour}`}
          className="absolute flex h-20 w-full items-center justify-end pr-2"
          style={{ top: `${hour * 80 - 40}px` }}
        >
          <span
            className={cn(
              'text-sm font-medium text-muted-foreground',
              hour === 0 && 'hidden'
            )}
          >
            {formatTime(hour)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default TimeTrail;
