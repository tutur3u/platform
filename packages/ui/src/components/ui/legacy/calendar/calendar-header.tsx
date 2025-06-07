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
}: {
  t: any;
  locale: string;
  date: Date;
  setDate: React.Dispatch<React.SetStateAction<Date>>;
  view: 'day' | '4-days' | 'week' | 'month';
  offset: number;
  availableViews: { value: string; label: string; disabled?: boolean }[];
  // eslint-disable-next-line no-unused-vars
  onViewChange: (view: 'day' | '4-days' | 'week' | 'month') => void;
  extras?: React.ReactNode;
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
        newDate.setDate(newDate.getDate() - offset);
      }
      return newDate;
    });

  const selectToday = () => setDate(new Date());
  const isToday = () => dayjs(date).isSame(dayjs(), 'day');
  const isCurrentMonth = () =>
    view === 'month' &&
    date.getMonth() === new Date().getMonth() &&
    date.getFullYear() === new Date().getFullYear();

  return (
    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <CalendarIcon className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <div className="flex flex-none items-center justify-center gap-2 md:justify-start">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handlePrev}
              aria-label="Previous period"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Button
              variant="outline"
              size="sm"
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
              variant="outline"
              size="icon"
              className="h-8 w-8"
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
                <SelectTrigger className="h-8 w-full">
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
