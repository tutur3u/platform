import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';

interface MonthCellProps {
  date: Date;
  hasGrid: boolean;
}

export function MonthCell({ date, hasGrid }: MonthCellProps) {
  const isToday = dayjs(date).isSame(dayjs(), 'day');
  const isCurrentMonth = dayjs(date).isSame(dayjs(), 'month');
  const isOtherMonth = !isCurrentMonth;

  return (
    <div className="relative">
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
