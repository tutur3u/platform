'use client';

import { useCalendarContext } from '@/contexts/CalendarContext';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import dayjs from 'dayjs';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function NavbarCalendarHeader({ locale }: { locale: string }) {
  const t = useTranslations('calendar');
  const { date, setDate, view, setView, availableViews } = useCalendarContext();

  const title = dayjs(date)
    .locale(locale)
    .format(locale === 'vi' ? 'MMMM, YYYY' : 'MMMM YYYY')
    .replace(/^\w/, (c) => c.toUpperCase());

  const getOffset = () => {
    return view === 'day' ? 1 : view === '4-days' ? 4 : view === 'week' ? 7 : 0;
  };

  const handleNext = () =>
    setDate((date) => {
      const newDate = new Date(date);
      if (view === 'month') {
        newDate.setMonth(newDate.getMonth() + 1);
      } else {
        newDate.setDate(newDate.getDate() + getOffset());
      }
      return newDate;
    });

  const handlePrev = () =>
    setDate((date) => {
      const newDate = new Date(date);
      if (view === 'month') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setDate(newDate.getDate() - getOffset());
      }
      return newDate;
    });

  const selectToday = () => setDate(new Date());
  const isToday = () => dayjs(date).isSame(dayjs(), 'day');
  const isCurrentMonth = () =>
    view === 'month' &&
    date.getMonth() === new Date().getMonth() &&
    date.getFullYear() === new Date().getFullYear();

  const onViewChange = (newView: string) => {
    setView(newView as 'day' | '4-days' | 'week' | 'month');
  };

  const views = availableViews.filter((view) => view?.disabled !== true);

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handlePrev}
          aria-label="Previous period"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="text-md h-8"
          onClick={isToday() || isCurrentMonth() ? undefined : selectToday}
          disabled={isToday() || isCurrentMonth()}
        >
          {view === 'day'
            ? t('today')
            : view === 'week'
              ? t('this-week')
              : view === 'month'
                ? t('this-month')
                : t('current')}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleNext}
          aria-label="Next period"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-md hidden font-medium md:block">{title}</h2>
        </div>
      </div>

      {views.length > 1 && (
        <Select value={view} onValueChange={onViewChange}>
          <SelectTrigger className="text-md h-8 w-[80px] md:w-[100px]">
            <SelectValue placeholder={t('view')} />
          </SelectTrigger>
          <SelectContent>
            {views.map((view) => (
              <SelectItem key={view.value} value={view.value}>
                {view.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
