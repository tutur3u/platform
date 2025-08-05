import { Button } from '@tuturuuu/ui/button';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function CalendarHeader({
  t,
  locale,
  date,
  setDate,
  view,
  offset,
  availableViews,
  onViewChange,
  extras,
  sidebarToggleButton,
}: {
  t: (key: string) => string;
  locale: string;
  date: Date;
  setDate: React.Dispatch<React.SetStateAction<Date>>;
  view: 'day' | '4-days' | 'week' | 'month';
  offset: number;
  availableViews: { value: string; label: string; disabled?: boolean }[];
  // eslint-disable-next-line no-unused-vars
  onViewChange: (view: 'day' | '4-days' | 'week' | 'month') => void;
  extras?: React.ReactNode;
  onSidebarToggle?: () => void;
  sidebarToggleButton?: React.ReactNode;
}) {
  const views = availableViews.filter((view) => view?.disabled !== true);

  const title = dayjs(date)
    .locale(locale)
    .format(locale === 'vi' ? 'MMMM, YYYY' : 'MMMM YYYY')
    .replace(/^\w/, (c) => c.toUpperCase());

  const handleNext = () =>
    setDate((date) => {
      const newDate = new Date(date);
      if (view === 'month') {
        newDate.setMonth(newDate.getMonth() + 1);
      } else {
        // offset is used here for non-month views
        newDate.setDate(newDate.getDate() + offset);
      }
      return newDate;
    });

  const handlePrev = () =>
    setDate((date) => {
      const newDate = new Date(date);
      if (view === 'month') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        // offset is used here for non-month views
        newDate.setDate(newDate.getDate() - offset);
      }
      return newDate;
    });

  const { isLoading, isSyncing } = useCalendarSync();
  const selectToday = () => setDate(new Date());
  const isToday = () => dayjs(date).isSame(dayjs(), 'day');
  const isCurrentMonth = () =>
    view === 'month' &&
    date.getMonth() === new Date().getMonth() &&
    date.getFullYear() === new Date().getFullYear();
  
  // Check if current date is in the current 4-day period
  const isCurrent4DayPeriod = () => {
    if (view !== '4-days') return false;
    const today = new Date();
    const currentDate = new Date(date);
    
    // For 4-day view, check if today is within the 4-day period starting from the current date
    const startDate = new Date(currentDate);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 3);
    
    return today >= startDate && today <= endDate;
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        {sidebarToggleButton}
        <h2 className="font-semibold text-xl tracking-tight">{title}</h2>
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          {/* Loading circle */}
          {(isLoading || isSyncing) && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
          <div className="flex flex-none items-center justify-center gap-2 md:justify-start">
            <Button
              variant="ghost"
              size="icon"
              style={{ height: '32px', width: '32px' }}
              onClick={handlePrev}
              aria-label="Previous period"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={isToday() || isCurrentMonth() || isCurrent4DayPeriod() ? undefined : selectToday}
              disabled={isToday() || isCurrentMonth() || isCurrent4DayPeriod()}
            >
              {view === 'day'
                ? t('today')
                : view === 'week'
                  ? t('this-week')
                  : view === 'month'
                    ? t('this-month')
                    : view === '4-days'
                      ? t('current')
                      : t('current')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              style={{ height: '32px', width: '32px' }}
              onClick={handleNext}
              aria-label="Next period"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {views.length > 1 && (
            <div className="w-full flex-1 md:w-auto">
              <Select
                value={view}
                onValueChange={(value) =>
                  onViewChange(value as 'day' | '4-days' | 'week' | 'month')
                }
              >
                <SelectTrigger className="h-10 w-full border-0">
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
            </div>
          )}
        </div>
        {extras}
      </div>
    </div>
  );
}
