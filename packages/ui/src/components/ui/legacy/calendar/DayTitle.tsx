import { cn } from '@tuturuuu/utils/format';

interface DayTitleProps {
  view: 'day' | '4-days' | 'week' | 'month';
  date: Date;
  weekday: string;
}

export default function DayTitle({ view, date, weekday }: DayTitleProps) {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  return (
    <div
      className={cn(
        'border-b border-l border-border text-center font-medium dark:border-zinc-800',
        view !== 'day' ? 'p-1.5' : 'md:p-1.5'
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center gap-1.5 rounded-md p-1.5',
          isToday &&
            'bg-primary/5 text-primary dark:bg-primary/10 dark:text-primary'
        )}
      >
        <span className="text-sm">{weekday}</span>
        <span
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full text-xs',
            isToday
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {date.getDate()}
        </span>
      </div>
    </div>
  );
}
