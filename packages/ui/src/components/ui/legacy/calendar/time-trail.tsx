import { dayjs } from '@tuturuuu/ui/lib/dayjs-setup';
import { cn } from '@tuturuuu/utils/format';
import type { Dayjs } from 'dayjs';
import { DAY_HEIGHT, HOUR_HEIGHT, TIME_LABEL_Y_OFFSET } from './config';
import { useCalendarSettings } from './settings/settings-context';

// Extract hours array as a constant to avoid recreation on every render
const HOURS = Array.from(Array(24).keys());

// Reusable component for time column
const TimeColumn = ({
  timezone: tz,
  primaryTimezone,
  timeFormat,
  className,
  style,
  muted,
  referenceDate,
}: {
  timezone: string | undefined;
  primaryTimezone: string | undefined;
  timeFormat: '24h' | '12h' | undefined;
  className?: string;
  style?: React.CSSProperties;
  muted?: boolean;
  referenceDate?: Date | string;
}) => {
  // Format time in the specified timezone
  const formatTime = (hour: number) => {
    const fmt = timeFormat === '24h' ? 'HH:mm' : 'h a';
    const ref = referenceDate ? dayjs(referenceDate) : dayjs();
    if (tz && tz !== 'auto') {
      // If a specific timezone is provided, show the time in tz that corresponds
      // to the given hour in the reference (primary) timezone.
      let baseDate: Dayjs;

      if (primaryTimezone === 'auto' || !primaryTimezone) {
        // If primary is local time, create a local time and convert to secondary
        baseDate = ref.hour(hour).minute(0).second(0).millisecond(0);
        baseDate = baseDate.tz(tz);
      } else {
        // If primary is a specific timezone, create time in that timezone first
        baseDate = ref
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
      const date = ref.hour(hour).minute(0).second(0).millisecond(0);
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
      {HOURS.map((hour) => (
        <div
          key={`trail-hour-${hour}`}
          className="absolute flex h-20 w-full items-center justify-end pr-2"
          style={{ top: `${(hour + TIME_LABEL_Y_OFFSET) * HOUR_HEIGHT}px` }}
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
    <div className="flex" style={{ height: DAY_HEIGHT }}>
      {showSecondary && (
        <TimeColumn
          timezone={secondaryTz}
          primaryTimezone={tz}
          timeFormat={timeFormat}
          className="border-border/30 border-r dark:border-zinc-700/50"
          muted={true}
          style={{ height: DAY_HEIGHT }}
          referenceDate={new Date()}
        />
      )}
      <TimeColumn
        timezone={tz}
        primaryTimezone={tz}
        timeFormat={timeFormat}
        style={{ height: DAY_HEIGHT }}
        referenceDate={new Date()}
      />
    </div>
  );
};
