import { useCalendar } from '../../../../hooks/use-calendar';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(timezone);

interface DayTitleProps {
  view: 'day' | '4-days' | 'week' | 'month';
  date: Date;
  weekday: string;
}

export default function DayTitle({ date, weekday }: DayTitleProps) {
  const { settings } = useCalendar();
  const tz = settings?.timezone?.timezone;
  const today = tz === 'auto' ? dayjs() : dayjs().tz(tz);
  const dayjsDate = tz === 'auto' ? dayjs(date) : dayjs(date).tz(tz);
  const isToday = dayjsDate.isSame(today, 'day');

  return (
    <div
      className={cn(
        'border-b border-l text-center font-medium'
        // view !== 'day' ? 'p-1.5' : 'md:p-1.5'
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center gap-1.5 p-1.5'
          // isToday && 'bg-border text-primary'
        )}
      >
        <span className="text-sm">{weekday}</span>
        <span
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full text-xs',
            isToday
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {dayjsDate.date()}
        </span>
      </div>
    </div>
  );
}
