import {
  AlertTriangle,
  CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Moon,
  MoonStar,
  RefreshCw,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import dayjs from 'dayjs';
import type { CalendarView } from '../../../../hooks/use-view-transition';

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
  view: CalendarView;
  offset: number;
  availableViews: { value: string; label: string; disabled?: boolean }[];

  onViewChange: (view: CalendarView) => void;
  extras?: React.ReactNode;
}) {
  const views = availableViews.filter((view) => view?.disabled !== true);
  const { value: showLunar, toggle: toggleLunar } = useUserBooleanConfig(
    'SHOW_LUNAR_CALENDAR',
    locale.startsWith('vi')
  );

  const title =
    view === 'year'
      ? String(date.getFullYear())
      : dayjs(date)
          .locale(locale)
          .format(locale === 'vi' ? 'MMMM, YYYY' : 'MMMM YYYY')
          .replace(/^\w/, (c) => c.toUpperCase());

  const handleNext = () =>
    setDate((date) => {
      const newDate = new Date(date);
      if (view === 'year') {
        newDate.setFullYear(newDate.getFullYear() + 1);
      } else if (view === 'month') {
        newDate.setMonth(newDate.getMonth() + 1);
      } else {
        newDate.setDate(newDate.getDate() + offset);
      }
      return newDate;
    });

  const handlePrev = () =>
    setDate((date) => {
      const newDate = new Date(date);
      if (view === 'year') {
        newDate.setFullYear(newDate.getFullYear() - 1);
      } else if (view === 'month') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setDate(newDate.getDate() - offset);
      }
      return newDate;
    });

  const { isLoading, isSyncing, syncStatus } = useCalendarSync();
  const selectToday = () => setDate(new Date());
  const isTodaySelected = () => dayjs(date).isSame(dayjs(), 'day');
  const isCurrentMonth = () =>
    view === 'month' &&
    date.getMonth() === new Date().getMonth() &&
    date.getFullYear() === new Date().getFullYear();
  const isCurrentYear = () =>
    view === 'year' && date.getFullYear() === new Date().getFullYear();

  const isCurrentPeriod =
    isTodaySelected() || isCurrentMonth() || isCurrentYear();

  const getTodayLabel = (): string => {
    switch (view) {
      case 'day':
        return t('today');
      case 'week':
      case '4-days':
      case 'agenda':
        return t('this-week');
      case 'month':
        return t('this-month');
      case 'year':
        return t('this-year');
      default:
        return t('current');
    }
  };

  const LunarIcon = showLunar ? MoonStar : Moon;
  const isBusy = isLoading || isSyncing || syncStatus.state === 'syncing';
  const statusLabel =
    syncStatus.state === 'error'
      ? t('failed_to_load_events')
      : isBusy
        ? t(isLoading ? 'loading_calendars' : 'syncing_calendars')
        : syncStatus.lastSyncTime
          ? `${t('sync_completed')} ${dayjs(syncStatus.lastSyncTime)
              .locale(locale)
              .format('HH:mm')}`
          : null;

  return (
    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <CalendarIcon className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-semibold text-xl tracking-tight">{title}</h2>
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          {statusLabel && (
            <div
              aria-live="polite"
              className="hidden min-w-0 items-center gap-1.5 rounded-full border bg-background/80 px-2 py-1 text-muted-foreground text-xs shadow-xs sm:inline-flex"
            >
              {syncStatus.state === 'error' ? (
                <AlertTriangle className="h-3.5 w-3.5 text-dynamic-red" />
              ) : isBusy ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <Check className="h-3.5 w-3.5 text-dynamic-green" />
              )}
              <span className="truncate">{statusLabel}</span>
            </div>
          )}
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
              onClick={isCurrentPeriod ? undefined : selectToday}
              disabled={isCurrentPeriod}
            >
              {getTodayLabel()}
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
                onValueChange={(value) => onViewChange(value as CalendarView)}
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showLunar ? 'default' : 'outline'}
                size="icon"
                className="h-8 w-8"
                onClick={toggleLunar}
                aria-label={locale === 'vi' ? 'Âm lịch' : 'Lunar calendar'}
              >
                <LunarIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {locale === 'vi' ? 'Âm lịch' : 'Lunar calendar'}
            </TooltipContent>
          </Tooltip>
        </div>
        {extras}
      </div>
    </div>
  );
}
