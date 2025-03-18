'use client';

import { CalendarProvider, useCalendar } from '../../../../hooks/use-calendar';
import CalendarHeader from './CalendarHeader';
import CalendarViewWithTrail from './CalendarViewWithTrail';
import MonthCalendar from './MonthCalendar';
import { UnifiedEventModal } from './UnifiedEventModal';
import WeekdayBar from './WeekdayBar';
import { Workspace } from '@tuturuuu/types/primitives/Workspace';
import { Button } from '@tuturuuu/ui/button';
import {
  type CalendarView,
  useViewTransition,
} from '@tuturuuu/ui/hooks/use-view-transition';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { PlusIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

// Floating action button for quick event creation
const CreateEventButton = () => {
  const { openModal } = useCalendar();

  return (
    <div className="fixed bottom-6 right-6 z-10 flex gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            className="h-14 w-14 rounded-full shadow-lg"
            onClick={() => openModal()}
          >
            <PlusIcon className="h-6 w-6" />
            <span className="sr-only">Create new event</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Create new event</TooltipContent>
      </Tooltip>
    </div>
  );
};

export const Calendar = ({
  t,
  locale,
  useQuery,
  useQueryClient,
  workspace,
  disabled,
}: {
  t: any;
  locale: string;
  useQuery: any;
  useQueryClient: any;
  workspace?: Workspace;
  disabled?: boolean;
}) => {
  const { googleTokens } = useCalendar();
  const { transition } = useViewTransition();

  const [initialized, setInitialized] = useState(false);
  const [date, setDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>();
  const [dates, setDates] = useState<Date[]>([]);
  const [availableViews, setAvailableViews] = useState<
    { value: string; label: string; disabled?: boolean }[]
  >([]);

  // Initialize available views
  useEffect(() => {
    if (initialized) return;

    setInitialized(true);
    setAvailableViews([
      {
        value: 'day',
        label: t('day'),
        disabled: false,
      },
      {
        value: '4-days',
        label: t('4-days'),
        disabled: window.innerWidth <= 768,
      },
      {
        value: 'week',
        label: t('week'),
        disabled: window.innerWidth <= 768,
      },
      {
        value: 'month',
        label: t('month'),
        disabled: false,
      },
    ]);
  }, [t, initialized]);

  // Update the date's hour and minute, every minute
  useEffect(() => {
    const secondsToNextMinute = 60 - new Date().getSeconds();

    const timeout = setTimeout(() => {
      setDate((date) => {
        const newDate = new Date(date);
        newDate.setHours(new Date().getHours());
        newDate.setMinutes(new Date().getMinutes());
        return newDate;
      });

      const interval = setInterval(() => {
        setDate((date) => {
          const newDate = new Date(date);
          newDate.setHours(new Date().getHours());
          newDate.setMinutes(new Date().getMinutes());
          return newDate;
        });
      }, 60000);

      return () => clearInterval(interval);
    }, secondsToNextMinute * 1000);

    return () => clearTimeout(timeout);
  }, []);

  // View switching handlers
  const enableDayView = useCallback(() => {
    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);

    transition('day', () => {
      setView('day');
      setDates([newDate]);
    });
  }, [date, transition]);

  const enable4DayView = useCallback(() => {
    const dates: Date[] = [];

    for (let i = 0; i < 4; i++) {
      const newDate = new Date(date);
      newDate.setHours(0, 0, 0, 0);
      newDate.setDate(newDate.getDate() + i);
      dates.push(newDate);
    }

    transition('4-days', () => {
      setView('4-days');
      setDates(dates);
    });
  }, [date, transition]);

  const enableWeekView = useCallback(() => {
    const getMonday = () => {
      const day = date.getDay() || 7;
      const newDate = new Date(date);
      if (day !== 1) newDate.setHours(-24 * (day - 1));
      return newDate;
    };

    const getWeekdays = () => {
      const monday = getMonday();
      const dates: Date[] = [];

      for (let i = 0; i < 7; i++) {
        const newDate = new Date(monday);
        newDate.setHours(0, 0, 0, 0);
        newDate.setDate(newDate.getDate() + i);
        dates.push(newDate);
      }
      return dates;
    };

    transition('week', () => {
      setView('week');
      setDates(getWeekdays());
    });
  }, [date, transition]);

  const enableMonthView = useCallback(() => {
    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);
    newDate.setDate(1); // First day of month

    transition('month', () => {
      setView('month');
      setDates([newDate]);
    });
  }, [date, transition]);

  // Update the dates array when date changes while maintaining the same view
  useEffect(() => {
    if (!view) return;

    if (view === 'day') {
      const newDate = new Date(date);
      newDate.setHours(0, 0, 0, 0);
      setDates([newDate]);
    } else if (view === '4-days') {
      const dates: Date[] = [];
      for (let i = 0; i < 4; i++) {
        const newDate = new Date(date);
        newDate.setHours(0, 0, 0, 0);
        newDate.setDate(newDate.getDate() + i);
        dates.push(newDate);
      }
      setDates(dates);
    } else if (view === 'week') {
      const getMonday = () => {
        const day = date.getDay() || 7;
        const newDate = new Date(date);
        if (day !== 1) newDate.setHours(-24 * (day - 1));
        return newDate;
      };

      const monday = getMonday();
      const weekDates: Date[] = [];
      for (let i = 0; i < 7; i++) {
        const newDate = new Date(monday);
        newDate.setHours(0, 0, 0, 0);
        newDate.setDate(newDate.getDate() + i);
        weekDates.push(newDate);
      }
      setDates(weekDates);
    } else if (view === 'month') {
      const newDate = new Date(date);
      newDate.setHours(0, 0, 0, 0);
      newDate.setDate(1);
      setDates([newDate]);
    }
  }, [date, view]);

  // Set initial view based on screen size
  useEffect(() => {
    const handleResize = () => {
      if (!view) {
        // Only set default view if there isn't one already
        if (window.innerWidth <= 768) enableDayView();
        else enableWeekView();
      } else if (view === '4-days' || view === 'week') {
        // If the current view is 4-days or week and the screen is small, switch to day view
        if (window.innerWidth <= 768) enableDayView();
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [enableDayView, enableWeekView, view]);

  if (!initialized || !view || !dates.length) return null;

  return (
    <CalendarProvider
      ws={workspace}
      useQuery={useQuery}
      useQueryClient={useQueryClient}
    >
      <div
        className={cn(
          'grid h-[calc(100%-2rem-4px)] w-full',
          view === 'month'
            ? 'grid-rows-[auto_1fr]'
            : 'grid-rows-[auto_auto_1fr]'
        )}
      >
        <CalendarHeader
          t={t}
          locale={locale}
          availableViews={availableViews}
          date={date}
          setDate={setDate}
          view={view}
          offset={
            view === 'day' ? 1 : view === '4-days' ? 4 : view === 'week' ? 7 : 0
          }
          onViewChange={(newView) => {
            if (newView === 'day') enableDayView();
            else if (newView === '4-days') enable4DayView();
            else if (newView === 'week') enableWeekView();
            else if (newView === 'month') enableMonthView();
          }}
        />

        {view !== 'month' && (
          <WeekdayBar locale={locale} view={view} dates={dates} />
        )}

        <div className="scrollbar-none relative flex-1 overflow-hidden">
          {view === 'month' && dates?.[0] ? (
            <MonthCalendar date={dates[0]} workspace={workspace} />
          ) : (
            <CalendarViewWithTrail dates={dates} />
          )}
        </div>

        {disabled ? null : (
          <>
            <UnifiedEventModal />
            <CreateEventButton />
          </>
        )}
      </div>
    </CalendarProvider>
  );
};

export default Calendar;
