import { useCalendar } from '../../../../hooks/use-calendar';
import { DAY_HEIGHT, HOUR_HEIGHT } from './config';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(timezone);

export const TimeTrail = () => {
  // Get settings from context
  const { settings } = useCalendar();
  const tz = settings?.timezone?.timezone;

  // Only show hours (not every half hour)
  const hours = Array.from(Array(24).keys());

  // Format time for display - only show hour
  const formatTime = (hour: number) => {
    let date = dayjs();
    date =
      tz === 'auto'
        ? date.hour(hour).minute(0).second(0).millisecond(0)
        : date.tz(tz).hour(hour).minute(0).second(0).millisecond(0);
    const timeFormat =
      settings?.appearance?.timeFormat === '24h' ? 'HH:mm' : 'h a';
    return date.format(timeFormat);
  };

  return (
    <div
      className="relative w-16 border-r border-border dark:border-zinc-800"
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
