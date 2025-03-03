import DayTitle from './DayTitle';
import { cn } from '@tuturuuu/utils/format';
import { Clock } from 'lucide-react';
import { useLocale } from 'next-intl';

const WeekdayBar = ({
  view,
  dates,
}: {
  view: 'day' | '4-days' | 'week' | 'month';
  dates: Date[];
}) => {
  const locale = useLocale();

  // Get the appropriate grid columns class based on the number of dates
  const getGridCols = (): string => {
    switch (dates.length) {
      case 1:
        return 'grid-cols-1';
      case 4:
        return 'grid-cols-4';
      case 7:
        return 'grid-cols-7';
      default:
        return 'grid-cols-7';
    }
  };

  return (
    <div className="flex">
      <div className="flex w-14 items-center justify-center rounded-tl-lg border border-r-0 border-border bg-muted/30 font-medium md:w-20 dark:border-zinc-800">
        <Clock className="mr-1 h-4 w-4 text-muted-foreground" />
      </div>
      <div
        className={cn(
          'grid flex-1 rounded-tr-lg border-t border-r border-border dark:border-zinc-800',
          getGridCols()
        )}
      >
        {dates.map((weekday) => (
          <div
            key={`date-${weekday.toLocaleString(locale, { weekday: 'short' })}-${weekday.getDate()}`}
            className="group transition-colors hover:bg-muted/20"
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
