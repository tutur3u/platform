import dayjs from 'dayjs';
import { cn } from '@tuturuuu/utils/format';

interface MonthCellProps {
  date: Date;
  /** Unique identifier for list rendering – do **not** call this `key` */
  cellId: React.Key;
  hasGrid: boolean;
}

export function MonthCell({ date, cellId, hasGrid }: MonthCellProps) {
  const isToday = dayjs(date).isSame(dayjs(), 'day');
  const isOtherMonth = !dayjs(date).isSame(dayjs(), 'month');

  return (
    <div key={cellId} className="relative">
      <div
        className={cn(
          'flex h-full w-full cursor-pointer items-center justify-center rounded-lg border border-transparent text-sm font-medium transition-all duration-200 hover:bg-accent hover:text-accent-foreground',
          isToday && 'bg-primary text-primary-foreground hover:bg-primary/90',
          isOtherMonth && 'text-muted-foreground',
          hasGrid && 'border-border'
        )}
      >
        {date.getDate()}
      </div>
    </div>
  );
}
