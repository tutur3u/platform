import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { HOUR_HEIGHT } from './config';
import { useCalendarSettings } from './settings/settings-context';

dayjs.extend(timezone);

// Reusable component for time column
const TimeColumn = ({
  timezone: tz,
  primaryTimezone,
  timeFormat,
  className,
  style,
  muted,
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
    const fmt = timeFormat === '24h' ? 'HH:mm' : 'h a';
    if (tz && tz !== 'auto') {
      // If a specific timezone is provided, show the time in tz that corresponds
      // to the given hour in the reference (primary) timezone.
      let baseDate: dayjs.Dayjs;

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

      return baseDate.format(fmt);
    } else {
      // Primary timezone - show the hour as-is
      const date = dayjs().hour(hour).minute(0).second(0).millisecond(0);
      return date.format(fmt);
    }
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
  const { settings } = useCalendarSettings();
  const tz = settings?.timezone?.timezone;
  const secondaryTz = settings?.timezone?.secondaryTimezone;
  const showSecondary =
    Boolean(settings?.timezone?.showSecondaryTimezone) && Boolean(secondaryTz);
  const timeFormat = settings?.appearance?.timeFormat;

  return (
    <div className="flex" style={{ height: 'auto', minHeight: '30px' }}>
      {showSecondary && (
        <TimeColumn
          timezone={secondaryTz}
          primaryTimezone={tz}
          timeFormat={timeFormat}
          className="border-border/30 border-r dark:border-zinc-700/50"
          muted={true}
          style={{ height: 'auto', minHeight: '30px' }}
        />
      )}
      <TimeColumn
        timezone={tz}
        primaryTimezone={tz}
        timeFormat={timeFormat}
        style={{ height: 'auto', minHeight: '30px' }}
      />
    </div>
  );
};
