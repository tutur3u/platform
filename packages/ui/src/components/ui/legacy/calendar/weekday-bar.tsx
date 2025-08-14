import { AllDayEventBar } from './all-day-event-bar';
import { MIN_COLUMN_WIDTH } from './config';
import { DayTitle } from './day-title';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { Clock } from 'lucide-react';

dayjs.extend(timezone);

export const WeekdayBar = ({
  locale,
  view,
  dates,
}: {
  locale: string;
  view: 'day' | '4-days' | 'week' | 'month';
  dates: Date[];
}) => {
  const { settings } = useCalendar();
  const showWeekends = settings.appearance.showWeekends;
  const tz = settings?.timezone?.timezone;
  const secondaryTz = settings?.timezone?.secondaryTimezone;
  const showSecondary =
    settings?.timezone?.showSecondaryTimezone && secondaryTz;

  // Filter out weekend days if showWeekends is false
  const visibleDates = showWeekends
    ? dates
    : dates.filter((date) => {
        const day =
          tz === 'auto' ? dayjs(date).day() : dayjs(date).tz(tz).day();
        return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
      });

  // Get timezone abbreviations
  const getPrimaryTimezoneAbbr = () => {
    if (tz === 'auto') {
      return (
        Intl.DateTimeFormat('en-US', {
          timeZoneName: 'short',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
          .formatToParts(new Date())
          .find((part) => part.type === 'timeZoneName')?.value || 'Local'
      );
    }
    return (
      Intl.DateTimeFormat('en-US', {
        timeZoneName: 'short',
        timeZone: tz,
      })
        .formatToParts(new Date())
        .find((part) => part.type === 'timeZoneName')?.value || tz
    );
  };

  const getSecondaryTimezoneAbbr = () => {
    if (!secondaryTz) return '';
    return (
      Intl.DateTimeFormat('en-US', {
        timeZoneName: 'short',
        timeZone: secondaryTz,
      })
        .formatToParts(new Date())
        .find((part) => part.type === 'timeZoneName')?.value || secondaryTz
    );
  };

  const primaryTzAbbr = getPrimaryTimezoneAbbr();
  const secondaryTzAbbr = getSecondaryTimezoneAbbr();

  return (
    <div className="flex flex-col bg-background/50">
      {/* Weekday header bar */}
      <div className="flex">
        {/* Time column headers */}
        <div className="flex">
          {/* Secondary timezone header (shows on left when enabled) */}
          {showSecondary && (
            <div className="flex w-16 flex-col items-center justify-center rounded-tl-lg border border-r-0 bg-muted/20 p-1 font-medium">
              <div className="text-[10px] font-medium text-muted-foreground/70">
                {secondaryTzAbbr}
              </div>
            </div>
          )}

          {/* Primary timezone header with clock icon */}
          <div
            className={cn(
              'flex w-16 flex-col items-center justify-center border border-r-0 bg-muted/30 p-1 font-medium',
              !showSecondary && 'rounded-tl-lg'
            )}
          >
            <Clock className="mb-0.5 h-3 w-3 text-muted-foreground" />
            <div className="text-[10px] font-medium text-muted-foreground">
              {primaryTzAbbr}
            </div>
          </div>
        </div>

        {/* Weekday columns */}
        <div
          className={cn('grid flex-1 rounded-tr-lg border-t border-r')}
          style={{
            gridTemplateColumns: `repeat(${visibleDates.length}, minmax(0, 1fr))`,
            minWidth: `${visibleDates.length * MIN_COLUMN_WIDTH}px`, // Match column width
          }}
        >
          {visibleDates.map((weekday) => {
            const dayjsDate =
              tz === 'auto' ? dayjs(weekday) : dayjs(weekday).tz(tz);
            return (
              <div
                key={`date-${dayjsDate.format('YYYY-MM-DD')}`}
                className="group transition-colors last:border-r-0 hover:bg-muted/20"
              >
                <DayTitle
                  view={view}
                  date={dayjsDate.toDate()}
                  weekday={dayjsDate
                    .locale(locale)
                    .format(locale === 'vi' ? 'dd' : 'ddd')}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* All-day events bar */}
      <AllDayEventBar dates={visibleDates} />
    </div>
  );
};
