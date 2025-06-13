import { useCalendar } from '../../../../hooks/use-calendar';
import { AllDayEventBar } from './all-day-event-bar';
import { MIN_COLUMN_WIDTH } from './config';
import { DayTitle } from './day-title';
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

  // Filter out weekend days if showWeekends is false
  const visibleDates = showWeekends
    ? dates
    : dates.filter((date) => {
        const day =
          tz === 'auto' ? dayjs(date).day() : dayjs(date).tz(tz).day();
        return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
      });

  return (
    <div className="flex flex-col bg-background/50">
      {/* Weekday header bar */}
      <div className="flex">
        {/* Time column header */}
        <div className="flex w-16 items-center justify-center rounded-tl-lg border border-r-0 bg-muted/30 p-2 font-medium">
          <Clock className="h-4 w-4 text-muted-foreground" />
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
