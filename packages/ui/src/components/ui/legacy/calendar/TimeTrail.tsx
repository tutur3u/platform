import { useCalendar } from '../../../../hooks/use-calendar';
import { DAY_HEIGHT, HOUR_HEIGHT } from './config';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';

const TimeTrail = () => {
  // Get settings from context
  const { settings } = useCalendar();

  // Only show hours (not every half hour)
  const hours = Array.from(Array(24).keys());

  // Format time for display - only show hour
  const formatTime = (hour: number) => {
    const date = new Date();
    date.setHours(hour, 0, 0, 0);

    // Use 24-hour format if specified in settings
    const timeFormat =
      settings?.appearance?.timeFormat === '24h' ? 'HH:mm' : 'h a';
    return format(date, timeFormat);
  };

  return (
    <div
      className="border-border relative w-16 border-r dark:border-zinc-800"
      style={{ height: DAY_HEIGHT }}
    >
      {hours.map((hour) => (
        <div
          key={`trail-hour-${hour}`}
          className="absolute flex h-20 w-full items-center justify-end pr-2"
          style={{ top: `${(hour - 0.65) * HOUR_HEIGHT}px` }}
        >
          <span
            className={cn(
              'text-muted-foreground text-sm font-medium',
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
