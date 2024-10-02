import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

export default function CalendarHeader({
  date,
  setDate,
  view,
  offset,
  // availableViews,
}: {
  date: Date;
  setDate: React.Dispatch<React.SetStateAction<Date>>;
  view: 'day' | '4-days' | 'week';
  offset: number;
  availableViews: { value: string; label: string; disabled?: boolean }[];
}) {
  const locale = useLocale();
  const t = useTranslations('calendar');

  // const views = availableViews.filter((view) => view?.disabled !== true);

  const title = dayjs(date)
    .locale(locale)
    .format(locale === 'vi' ? 'MMMM, YYYY' : 'MMMM YYYY')
    .replace(/^\w/, (c) => c.toUpperCase());

  const handleNext = () =>
    setDate((date) => {
      const newDate = new Date(date);
      newDate.setDate(newDate.getDate() + offset);
      return newDate;
    });

  const handlePrev = () =>
    setDate((date) => {
      const newDate = new Date(date);
      newDate.setDate(newDate.getDate() - offset);
      return newDate;
    });

  const selectToday = () => setDate(new Date());
  const isToday = () => dayjs(date).isSame(dayjs(), 'day');

  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-4 text-2xl font-semibold lg:text-3xl">
        <span>{title}</span>
      </div>

      <div className="flex items-center justify-center gap-4 text-zinc-600 dark:text-zinc-300">
        <div className="flex h-full gap-0.5">
          <button
            className="h-full rounded-l-lg bg-zinc-500/10 p-2 text-3xl transition hover:bg-zinc-500/20 dark:bg-zinc-300/10 dark:hover:bg-zinc-300/20"
            onClick={handlePrev}
          >
            <ChevronLeft className="w-4" />
          </button>

          <button
            onClick={isToday() ? undefined : selectToday}
            className={`px-4 py-1 font-semibold transition ${
              isToday()
                ? 'text-foreground/80 cursor-not-allowed bg-zinc-500/20 opacity-50 dark:bg-zinc-300/10 dark:text-zinc-300'
                : 'cursor-pointer bg-zinc-500/10 text-zinc-600 hover:bg-zinc-500/20 dark:bg-zinc-300/10 dark:text-zinc-300 dark:hover:bg-zinc-300/20'
            }`}
          >
            {view === 'day'
              ? t('today')
              : view === 'week'
                ? t('this-week')
                : t('current')}
          </button>

          <button
            className="h-full rounded-r-lg bg-zinc-500/10 p-2 text-3xl transition hover:bg-zinc-500/20 dark:bg-zinc-300/10 dark:hover:bg-zinc-300/20"
            onClick={handleNext}
          >
            <ChevronRight className="w-4" />
          </button>
        </div>

        {/* {views.length > 1 && (
          <SegmentedControl
            radius="md"
            value={view}
            data={views}
            onChange={(value) => {
              if (value === 'day') enableDayView();
              if (value === '4-days') enable4DayView();
              if (value === 'week') enableWeekView();
            }}
          />
        )} */}
      </div>
    </div>
  );
}
