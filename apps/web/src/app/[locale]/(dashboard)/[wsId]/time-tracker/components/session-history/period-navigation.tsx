'use client';

import { ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { ViewMode } from './session-types';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

interface PeriodNavigationProps {
  viewMode: ViewMode;
  currentDate: dayjs.Dayjs;
  onViewModeChange: (mode: ViewMode) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function PeriodNavigation({
  viewMode,
  currentDate,
  onViewModeChange,
  onPrevious,
  onNext,
  onToday,
}: PeriodNavigationProps) {
  const t = useTranslations('time-tracker.session_history');
  const userTimezone = dayjs.tz.guess();
  const today = dayjs().tz(userTimezone);

  const formatPeriod = useMemo(() => {
    if (viewMode === 'day') return currentDate.format('MMMM D, YYYY');
    if (viewMode === 'week') {
      const start = currentDate.startOf('isoWeek');
      const end = currentDate.endOf('isoWeek');
      return `${start.format('MMM D')} - ${end.format('MMM D, YYYY')}`;
    }
    if (viewMode === 'month') return currentDate.format('MMMM YYYY');
    return '';
  }, [currentDate, viewMode]);

  const isCurrentPeriod = useMemo(() => {
    return today.isSame(currentDate, viewMode);
  }, [currentDate, viewMode, today]);

  return (
    <div className="flex flex-col justify-between gap-4 border-t pt-4 md:flex-row md:items-center">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
          <Button
            key={mode}
            variant={viewMode === mode ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange(mode)}
            className={cn(
              'h-9 min-w-[70px] flex-1 capitalize transition-all sm:flex-none md:h-10'
            )}
          >
            {t(mode as 'day' | 'week' | 'month')}
          </Button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 md:justify-end">
        <div className="flex w-full items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={onPrevious}
            className="h-9 w-9 shrink-0 transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 md:h-10 md:w-10"
            title={t('previous')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="w-full min-w-[140px] text-center font-semibold text-sm md:min-w-[180px] md:text-base">
            {formatPeriod}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={onNext}
            className="h-9 w-9 shrink-0 transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 md:h-10 md:w-10"
            title={t('next')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {!isCurrentPeriod && (
          <Button
            variant="outline"
            size="sm"
            onClick={onToday}
            className="h-9 whitespace-nowrap text-xs md:h-10 md:text-sm"
          >
            {viewMode === 'day'
              ? t('today')
              : viewMode === 'week'
                ? t('this_week')
                : t('this_month')}
          </Button>
        )}
      </div>
    </div>
  );
}
