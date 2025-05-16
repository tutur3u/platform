import { useCalendar } from '../../../../hooks/use-calendar';
import { AllDayEventBar } from './all-day-event-bar';
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
    <div className="flex flex-col">
      {/* Weekday header bar */}
      <div className="flex">
        {/* Time column header */}
        <div className="bg-muted/30 flex w-16 items-center justify-center rounded-tl-lg border border-r-0 p-2 font-medium">
          <Clock className="text-muted-foreground h-4 w-4" />
        </div>

        {/* Weekday columns */}
        <div
          className={cn('grid flex-1 rounded-tr-lg border-r border-t')}
          style={{
            gridTemplateColumns: `repeat(${visibleDates.length}, minmax(0, 1fr))`,
            minWidth: `${visibleDates.length * 120}px`, // Match column width
          }}
        >
          {visibleDates.map((weekday) => {
            const dayjsDate =
              tz === 'auto' ? dayjs(weekday) : dayjs(weekday).tz(tz);
            return (
              <div
                key={`date-${dayjsDate.format('YYYY-MM-DD')}`}
                className="hover:bg-muted/20 group transition-colors last:border-r-0"
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
