import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { useCalendar } from '../../../../hooks/use-calendar';
import { DAY_HEIGHT, HOUR_HEIGHT } from './config';

dayjs.extend(timezone);

// Reusable component for time column
const TimeColumn = ({
  timezone: tz,
  primaryTimezone,
  timeFormat,
  className,
  style,
  muted = false,
}: {
  timezone: string | undefined;
  primaryTimezone: string | undefined;
  timeFormat: '24h' | '12h' | undefined;
  className?: string;
  style?: React.CSSProperties;
  muted?: boolean;
}) => {
  const hours = Array.from(Array(24).keys());

  // Format time in the specified timezone
  const formatTime = (hour: number) => {
    if (tz && tz !== 'auto') {
      // For secondary timezone: show what time it is in that timezone
      // when it's the specified hour in the primary timezone
      let baseDate;

      if (primaryTimezone === 'auto' || !primaryTimezone) {
        // If primary is local time, create a local time and convert to secondary
        baseDate = dayjs().hour(hour).minute(0).second(0).millisecond(0);
        baseDate = baseDate.tz(tz);
      } else {
        // If primary is a specific timezone, create time in that timezone first
        baseDate = dayjs()
          .tz(primaryTimezone)
          .hour(hour)
          .minute(0)
          .second(0)
          .millisecond(0);
        baseDate = baseDate.tz(tz);
      }

      const format = timeFormat === '24h' ? 'HH:mm' : 'h a';
      return baseDate.format(format);
    } else {
      // Primary timezone - show the hour as-is
      const date = dayjs().hour(hour).minute(0).second(0).millisecond(0);
      const format = timeFormat === '24h' ? 'HH:mm' : 'h a';
      return date.format(format);
    }
  };

  return (
    <div
      className={cn(
        'relative w-16 border-r border-border dark:border-zinc-800',
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
              'font-medium text-sm',
              muted ? 'text-muted-foreground/60' : 'text-muted-foreground',
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
  const secondaryTz = settings?.timezone?.secondaryTimezone;
  const showSecondary =
    Boolean(settings?.timezone?.showSecondaryTimezone) && Boolean(secondaryTz);
  const timeFormat = settings?.appearance?.timeFormat;

  return (
    <div className="flex" style={{ height: DAY_HEIGHT }}>
      {showSecondary && (
        <TimeColumn
          timezone={secondaryTz}
          primaryTimezone={tz}
          timeFormat={timeFormat}
          className="border-border/30 border-r dark:border-zinc-700/50"
          muted={true}
          style={{ height: DAY_HEIGHT }}
        />
      )}
      <TimeColumn
        timezone={tz}
        primaryTimezone={tz}
        timeFormat={timeFormat}
        style={{ height: DAY_HEIGHT }}
      />
    </div>
  );
};
