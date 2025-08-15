import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { useCalendar } from '../../../../hooks/use-calendar';
import { DAY_HEIGHT, HOUR_HEIGHT } from './config';

dayjs.extend(timezone);

// Reusable component for time column
const TimeColumn = ({
  timezone: tz,
  timeFormat,
  className,
  style,
}: {
  timezone: string | undefined;
  timeFormat: '24h' | '12h' | undefined;
  className?: string;
  style?: React.CSSProperties;
}) => {
  const hours = Array.from(Array(24).keys());

  // Simplified formatTime function
  const formatTime = (hour: number) => {
    let date = dayjs();

    if (tz && tz !== 'auto') {
      date = date.tz(tz);
    }

    date = date.hour(hour).minute(0).second(0).millisecond(0);

    const format = timeFormat === '24h' ? 'HH:mm' : 'h a';
    return date.format(format);
  };

  return (
    <div
      className={cn(
        'relative w-16 border-border border-r dark:border-zinc-800',
        className
      )}
      style={style}
    >
      {hours.map((hour) => (
        <div
          key={`trail-hour-${hour}`}
          className="absolute flex h-20 w-full items-center justify-end pr-2"
          style={{ top: `${(hour - 0.65) * HOUR_HEIGHT}px` }}
        >
          <span
            className={cn(
              'font-medium text-muted-foreground text-sm',
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

export const TimeTrail = () => {
  // Get settings from context
  const { settings } = useCalendar();
  const tz = settings?.timezone?.timezone;
  const timeFormat = settings?.appearance?.timeFormat;

  return (
    <TimeColumn
      timezone={tz}
      timeFormat={timeFormat}
      style={{ height: DAY_HEIGHT }}
    />
  );
};
