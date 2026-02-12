import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import type { CalendarView } from '../../../../hooks/use-view-transition';
import {
  formatLunarDay,
  getLunarDate,
  getLunarHolidayName,
  isSpecialLunarDate,
} from '../../../../lib/lunar-calendar';
import { useCalendarSettings } from './settings/settings-context';

dayjs.extend(timezone);

interface DayTitleProps {
  view: CalendarView;
  date: Date;
  weekday: string;
  locale?: string;
}

export function DayTitle({ date, weekday, locale = 'en' }: DayTitleProps) {
  const { settings } = useCalendarSettings();
  const tz = settings?.timezone?.timezone;
  const { value: showLunar } = useUserBooleanConfig(
    'SHOW_LUNAR_CALENDAR',
    locale.startsWith('vi')
  );
  const today = tz === 'auto' ? dayjs() : dayjs().tz(tz);
  const dayjsDate = tz === 'auto' ? dayjs(date) : dayjs(date).tz(tz);
  const isToday = dayjsDate.isSame(today, 'day');

  const lunar = showLunar ? getLunarDate(dayjsDate.toDate()) : null;
  const holidayName = lunar ? getLunarHolidayName(lunar, locale) : null;
  const isSpecial = lunar ? isSpecialLunarDate(lunar) : false;

  return (
    <div className={cn('border-b border-l text-center font-medium')}>
      <div className={cn('flex items-center justify-center gap-1.5 p-1.5')}>
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
        {lunar && (
          <span
            className={cn(
              'text-[10px] leading-none',
              isSpecial
                ? 'font-semibold text-dynamic-orange'
                : 'text-muted-foreground'
            )}
            title={holidayName ?? undefined}
          >
            {formatLunarDay(lunar)}
          </span>
        )}
      </div>
    </div>
  );
}
