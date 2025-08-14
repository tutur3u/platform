import { DAY_HEIGHT, HOUR_HEIGHT } from './config';
import { useCalendarSettings } from './settings/settings-context';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(timezone);

export const TimeTrail = () => {
  // Get settings from context
  const { settings } = useCalendarSettings();
  const tz = settings?.timezone?.timezone;
  const secondaryTz = settings?.timezone?.secondaryTimezone;
  const showSecondary =
    settings?.timezone?.showSecondaryTimezone && secondaryTz;

  // Only show hours (not every half hour)
  const hours = Array.from(Array(24).keys());

  // Format time for display - only show hour
  const formatTime = (hour: number, timezone?: string) => {
    let date = dayjs();

    if (timezone) {
      // Use specific timezone
      date = date.tz(timezone).hour(hour).minute(0).second(0).millisecond(0);
    } else {
      // Use primary timezone logic
      date =
        tz === 'auto'
          ? date.hour(hour).minute(0).second(0).millisecond(0)
          : date.tz(tz).hour(hour).minute(0).second(0).millisecond(0);
    }

    const timeFormat =
      settings?.appearance?.timeFormat === '24h' ? 'HH:mm' : 'h a';
    return date.format(timeFormat);
  };

  return (
    <div className="flex">
      {/* Secondary timezone column (shows on left when enabled) */}
      {showSecondary && (
        <div
          className="relative w-16 border-r border-border/30 dark:border-zinc-700/50"
          style={{ height: DAY_HEIGHT }}
        >
          {hours.map((hour) => (
            <div
              key={`secondary-trail-hour-${hour}`}
              className="absolute flex h-20 w-full items-center justify-end pr-2"
              style={{ top: `${(hour - 0.65) * HOUR_HEIGHT}px` }}
            >
              <span
                className={cn(
                  'text-sm font-medium text-muted-foreground/60 transition-colors hover:text-muted-foreground/80',
                  hour === 0 && 'hidden'
                )}
              >
                {formatTime(hour, secondaryTz)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Primary timezone column */}
      <div
        className="relative w-16 border-r border-border dark:border-zinc-800"
        style={{ height: DAY_HEIGHT }}
      >
        {hours.map((hour) => (
          <div
            key={`primary-trail-hour-${hour}`}
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
    </div>
  );
};
