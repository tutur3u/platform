import DayTitle from './DayTitle';
import { cn } from '@tuturuuu/utils/format';
import { Clock } from 'lucide-react';

const WeekdayBar = ({
  locale,
  view,
  dates,
}: {
  locale: string;
  view: 'day' | '4-days' | 'week' | 'month';
  dates: Date[];
}) => {
  return (
    <div className="flex">
      {/* Time column header */}
      <div className="flex w-16 items-center justify-center rounded-tl-lg border border-r-0 border-border bg-muted/30 font-medium dark:border-zinc-800">
        <Clock className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Weekday columns */}
      <div
        className={cn(
          'grid flex-1 rounded-tr-lg border-t border-r border-border dark:border-zinc-800'
        )}
        style={{
          gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))`,
          minWidth: `${dates.length * 120}px`, // Match column width
        }}
      >
        {dates.map((weekday) => (
          <div
            key={`date-${weekday.toLocaleString(locale, { weekday: 'short' })}-${weekday.getDate()}`}
            className="group border-r border-border transition-colors last:border-r-0 hover:bg-muted/20 dark:border-zinc-800"
          >
            <DayTitle
              view={view}
              date={weekday}
              weekday={weekday.toLocaleString(locale, {
                weekday: locale === 'vi' ? 'narrow' : 'short',
              })}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default WeekdayBar;
