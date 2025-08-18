import { useCalendar } from '../../../../hooks/use-calendar';
import { AllDayEventBar } from './all-day-event-bar';
import { MIN_COLUMN_WIDTH } from './config';
import { DayTitle } from './day-title';
import { TimeColumnHeaders } from './time-column-headers';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { useMemo } from 'react';

dayjs.extend(timezone);

export const WeekdayBar = ({
  dates,
  view,
  locale,
}: {
  dates: Date[];
  view: 'day' | '4-days' | 'week' | 'month';
  locale: string;
}) => {
  const { settings } = useCalendar();
  const showWeekends = settings.appearance.showWeekends;
  const tz = settings?.timezone?.timezone;
  const secondaryTz = settings?.timezone?.secondaryTimezone;
  const showSecondary = Boolean(
    settings?.timezone?.showSecondaryTimezone && secondaryTz
  );

  // Filter out weekend days if showWeekends is false
  const visibleDates = showWeekends
    ? dates
    : dates.filter((date) => {
        const day =
          tz === 'auto' ? dayjs(date).day() : dayjs(date).tz(tz).day();
        return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
      });

  // Get timezone abbreviations with error handling and memoization
  const primaryTzAbbr = useMemo(() => {
    if (!tz) return '';

    let tzToUse = tz;
    let fallback = tz;

    if (tz === 'auto') {
      try {
        tzToUse = Intl.DateTimeFormat().resolvedOptions().timeZone;
        fallback = 'Local';
      } catch (e) {
        console.error('Failed to detect system timezone', e);
        return 'Local';
      }
    }

    try {
      return (
        Intl.DateTimeFormat('en-US', {
          timeZoneName: 'short',
          timeZone: tzToUse,
        })
          .formatToParts(new Date())
          .find((part) => part.type === 'timeZoneName')?.value || fallback
      );
    } catch (e) {
      console.error(`Failed to get abbreviation for timezone: ${tzToUse}`, e);
      return fallback;
    }
  }, [tz]);

  const secondaryTzAbbr = useMemo(() => {
    if (!secondaryTz) return '';

    try {
      return (
        Intl.DateTimeFormat('en-US', {
          timeZoneName: 'short',
          timeZone: secondaryTz,
        })
          .formatToParts(new Date())
          .find((part) => part.type === 'timeZoneName')?.value || secondaryTz
      );
    } catch (e) {
      console.error(
        `Failed to get abbreviation for timezone: ${secondaryTz}`,
        e
      );
      return secondaryTz;
    }
  }, [secondaryTz]);

  return (
    <div className="flex flex-col bg-background/50">
      {/* Weekday header bar */}
      <div className="flex">
        {/* Time column headers */}
        <TimeColumnHeaders
          showSecondary={showSecondary}
          secondaryTzAbbr={secondaryTzAbbr}
          primaryTzAbbr={primaryTzAbbr}
          variant="weekday"
        />

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
