import type { Workspace, WorkspaceCalendarGoogleToken } from '@tuturuuu/types';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import type { CalendarView } from '@tuturuuu/ui/hooks/use-view-transition';
import { useViewTransition } from '@tuturuuu/ui/hooks/use-view-transition';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AgendaView } from './agenda-view';
import { CalendarHeader } from './calendar-header';
import { CalendarViewWithTrail } from './calendar-view-with-trail';
import { EventModal } from './event-modal';
import { MonthCalendar } from './month-calendar';
import { useCalendarSettings } from './settings/settings-context';
import { WeekdayBar } from './weekday-bar';
import { YearCalendar } from './year-calendar';

// Get the first day of week number from settings
// 0 = Sunday, 1 = Monday, 6 = Saturday
function getFirstDayOfWeekNumber(
  setting: string | undefined,
  locale: string
): number {
  if (setting === 'sunday') return 0;
  if (setting === 'saturday') return 6;
  if (setting === 'monday') return 1;

  // 'auto' or undefined - detect from locale
  // Most locales use Monday, but US/Canada/Japan and others use Sunday
  const sundayFirstLocales = [
    'en-US',
    'en-CA',
    'ja',
    'ja-JP',
    'ko',
    'ko-KR',
    'zh-TW',
    'he',
    'he-IL',
    'ar',
    'ar-SA',
  ];

  // Check if locale starts with any of the Sunday-first locale prefixes
  const normalizedLocale = locale.toLowerCase();
  if (
    sundayFirstLocales.some(
      (l) =>
        normalizedLocale === l.toLowerCase() ||
        normalizedLocale.startsWith(`${l.toLowerCase().split('-')[0]}-`)
    )
  ) {
    // Special case: only en-US and en-CA use Sunday, other en-* use Monday
    if (normalizedLocale.startsWith('en')) {
      return normalizedLocale === 'en-us' || normalizedLocale === 'en-ca'
        ? 0
        : 1;
    }
    return 0;
  }

  return 1; // Default to Monday for most locales
}

function getMonthGridDates(date: Date, firstDayOfWeek: number): Date[] {
  const newDate = new Date(date);
  newDate.setHours(0, 0, 0, 0);
  newDate.setDate(1);

  const monthStart = new Date(newDate);
  const monthEnd = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0);

  // Calculate the first visible day (start of the week containing the 1st)
  const gridStart = new Date(monthStart);
  while (gridStart.getDay() !== firstDayOfWeek) {
    gridStart.setDate(gridStart.getDate() - 1);
  }

  // Calculate the last visible day (end of the week containing the last day)
  const gridEnd = new Date(monthEnd);
  const lastDayOfWeek = (firstDayOfWeek + 6) % 7;
  while (gridEnd.getDay() !== lastDayOfWeek) {
    gridEnd.setDate(gridEnd.getDate() + 1);
  }

  // Fill all days in the grid
  const gridDates: Date[] = [];
  for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    gridDates.push(new Date(d));
  }
  return gridDates;
}

export const CalendarContent = ({
  t,
  locale,
  disabled,
  workspace,
  enableHeader = true,
  externalState,
  extras,
  overlay,
}: {
  t: any;
  locale: string;
  disabled?: boolean;
  workspace?: Workspace;
  enableHeader?: boolean;
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
  externalState?: {
    date: Date;
    setDate: React.Dispatch<React.SetStateAction<Date>>;
    view: CalendarView;
    setView: React.Dispatch<React.SetStateAction<CalendarView>>;
    availableViews: { value: string; label: string; disabled?: boolean }[];
  };
  extras?: React.ReactNode;
  overlay?: React.ReactNode;
}) => {
  const { transition } = useViewTransition();
  const { settings } = useCalendarSettings();
  const { dates, setDates } = useCalendarSync();

  // Use ref to always have the latest settings without causing dependency cascades
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const [initialized, setInitialized] = useState(false);
  const [date, setDate] = useState(externalState?.date || new Date());
  const [view, setView] = useState<CalendarView>(externalState?.view || 'week');
  const [availableViews, setAvailableViews] = useState<
    { value: string; label: string; disabled?: boolean }[]
  >(externalState?.availableViews || []);

  // LocalStorage key for view persistence
  const VIEW_STORAGE_KEY = 'calendar-view-mode';

  // Use the external state handlers when provided
  const handleSetDate = useCallback(
    (newDate: Date | ((prevDate: Date) => Date)) => {
      if (externalState?.setDate) {
        externalState.setDate(newDate);
      } else {
        setDate(newDate);
      }
    },
    [externalState]
  );

  const handleSetView = useCallback(
    (newView: CalendarView) => {
      if (externalState?.setView) {
        externalState.setView(newView);
      } else {
        setView(newView);
      }
      // Persist view selection to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(VIEW_STORAGE_KEY, newView);
      }
    },
    [externalState]
  );

  // View switching handlers
  const enableDayView = useCallback(() => {
    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);

    transition('day', () => {
      handleSetView('day');
      setDates([newDate]);
    });
  }, [date, transition, handleSetView, setDates]);

  const enable4DayView = useCallback(() => {
    const dates: Date[] = [];

    for (let i = 0; i < 4; i++) {
      const newDate = new Date(date);
      newDate.setHours(0, 0, 0, 0);
      newDate.setDate(newDate.getDate() + i);
      dates.push(newDate);
    }

    transition('4-days', () => {
      handleSetView('4-days');
      setDates(dates);
    });
    console.log('enable4DayView', dates);
  }, [date, transition, handleSetView, setDates]);

  const enableWeekView = useCallback(() => {
    // Use settingsRef to avoid dependency cascade issues during initialization
    const currentSettings = settingsRef.current;
    const showWeekends = currentSettings?.appearance?.showWeekends !== false;
    const firstDayNumber = getFirstDayOfWeekNumber(
      currentSettings?.appearance?.firstDayOfWeek,
      locale
    );

    const getFirstDayOfWeekDate = () => {
      const currentDate = new Date(date);
      const day = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

      // Calculate the difference between current day and desired first day
      let diff = day - firstDayNumber;

      // If the difference is negative, we need to go back to the previous week
      if (diff < 0) diff += 7;

      // Create a new date by subtracting the difference
      const newDate = new Date(currentDate);
      newDate.setDate(currentDate.getDate() - diff);
      return newDate;
    };

    const getWeekdays = () => {
      const firstDay = getFirstDayOfWeekDate();
      const dates: Date[] = [];

      for (let i = 0; i < 7; i++) {
        const newDate = new Date(firstDay);
        newDate.setHours(0, 0, 0, 0);
        newDate.setDate(newDate.getDate() + i);

        // Skip weekends if showWeekends is false
        if (!showWeekends) {
          const day = newDate.getDay();
          if (day === 0 || day === 6) continue; // Skip Saturday and Sunday
        }

        dates.push(newDate);
      }
      return dates;
    };

    transition('week', () => {
      handleSetView('week');
      setDates(getWeekdays());
    });
  }, [date, locale, transition, handleSetView, setDates]);

  const enableMonthView = useCallback(() => {
    const currentSettings = settingsRef.current;
    const firstDayNumber = getFirstDayOfWeekNumber(
      currentSettings?.appearance?.firstDayOfWeek,
      locale
    );
    const newDate = new Date(date);
    newDate.setDate(1);
    setView('month');
    setDate(newDate);
    const gridDates = getMonthGridDates(newDate, firstDayNumber);
    setDates(gridDates);
  }, [date, locale, setDates]);

  const enableYearView = useCallback(() => {
    const newDate = new Date(date);
    newDate.setMonth(0);
    newDate.setDate(1);
    newDate.setHours(0, 0, 0, 0);

    transition('year', () => {
      handleSetView('year');
      setDates([newDate]);
    });
  }, [date, transition, handleSetView, setDates]);

  const enableAgendaView = useCallback(() => {
    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);

    transition('agenda', () => {
      handleSetView('agenda');
      setDates([newDate]);
    });
  }, [date, transition, handleSetView, setDates]);

  // Initialize available views
  useEffect(() => {
    if (initialized) return;

    setInitialized(true);

    if (!externalState?.availableViews) {
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
        {
          value: 'year',
          label: t('year'),
          disabled: false,
        },
        {
          value: 'agenda',
          label: t('agenda'),
          disabled: false,
        },
      ]);
    }

    // Set initial view based on settings or external state
    if (externalState?.view) {
      if (externalState.view === 'day') enableDayView();
      else if (externalState.view === '4-days') enable4DayView();
      else if (externalState.view === 'week') enableWeekView();
      else if (externalState.view === 'month') enableMonthView();
      else if (externalState.view === 'year') enableYearView();
      else if (externalState.view === 'agenda') enableAgendaView();
    } else {
      // Load saved view from localStorage
      const savedView =
        typeof window !== 'undefined'
          ? (localStorage.getItem(VIEW_STORAGE_KEY) as CalendarView | null)
          : null;

      const isMobile =
        typeof window !== 'undefined' && window.innerWidth <= 768;

      // Handle saved view with special case for month
      if (savedView) {
        if (savedView === 'month') {
          // Month view exception: show day on mobile, week on larger screens
          if (isMobile) {
            enableDayView();
          } else {
            enableWeekView();
          }
        } else if (
          (savedView === 'week' || savedView === '4-days') &&
          isMobile
        ) {
          // Week and 4-day views are disabled on mobile
          enableDayView();
        } else {
          // Apply saved view
          if (savedView === 'day') enableDayView();
          else if (savedView === '4-days') enable4DayView();
          else if (savedView === 'week') enableWeekView();
          else if (savedView === 'year') enableYearView();
          else if (savedView === 'agenda') enableAgendaView();
          else enableWeekView();
        }
      } else {
        // No saved view - default to day on mobile, week on desktop
        if (isMobile) {
          enableDayView();
        } else {
          enableWeekView();
        }
      }
    }
  }, [
    t,
    initialized,
    enableDayView,
    enable4DayView,
    enableWeekView,
    enableMonthView,
    enableYearView,
    enableAgendaView,
    externalState,
  ]);

  // Update the date when external state changes
  useEffect(() => {
    if (externalState?.date) {
      setDate(externalState.date);
    }
  }, [externalState?.date]);

  // Update the view when external state changes
  useEffect(() => {
    if (externalState?.view && view !== externalState.view) {
      setView(externalState.view);
    }
  }, [externalState?.view, view]);

  // Update the date's hour and minute, every minute
  useEffect(() => {
    const secondsToNextMinute = 60 - new Date().getSeconds();

    const timeout = setTimeout(() => {
      handleSetDate((date) => {
        const newDate = new Date(date);
        newDate.setHours(new Date().getHours());
        newDate.setMinutes(new Date().getMinutes());
        return newDate;
      });

      const interval = setInterval(() => {
        handleSetDate((date) => {
          const newDate = new Date(date);
          newDate.setHours(new Date().getHours());
          newDate.setMinutes(new Date().getMinutes());
          return newDate;
        });
      }, 60000);

      return () => clearInterval(interval);
    }, secondsToNextMinute * 1000);

    return () => clearTimeout(timeout);
  }, [handleSetDate]);

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
      // Get the first day of week from settings (supports 'auto', 'sunday', 'monday', 'saturday')
      const showWeekends = settings?.appearance?.showWeekends !== false;
      const firstDayNumber = getFirstDayOfWeekNumber(
        settings?.appearance?.firstDayOfWeek,
        locale
      );

      const getFirstDayOfWeekDate = () => {
        const currentDate = new Date(date);
        const day = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

        // Calculate the difference between current day and desired first day
        let diff = day - firstDayNumber;

        // If the difference is negative, we need to go back to the previous week
        if (diff < 0) diff += 7;

        // Create a new date by subtracting the difference
        const newDate = new Date(currentDate);
        newDate.setDate(currentDate.getDate() - diff);
        return newDate;
      };

      const firstDay = getFirstDayOfWeekDate();
      const weekDates: Date[] = [];

      for (let i = 0; i < 7; i++) {
        const newDate = new Date(firstDay);
        newDate.setHours(0, 0, 0, 0);
        newDate.setDate(newDate.getDate() + i);

        // Skip weekends if showWeekends is false
        if (!showWeekends) {
          const day = newDate.getDay();
          if (day === 0 || day === 6) continue; // Skip Saturday and Sunday
        }

        weekDates.push(newDate);
      }
      setDates(weekDates);
    } else if (view === 'month') {
      const firstDayNumber = getFirstDayOfWeekNumber(
        settings?.appearance?.firstDayOfWeek,
        locale
      );
      const gridDates = getMonthGridDates(date, firstDayNumber);
      setDates(gridDates);
    } else if (view === 'year') {
      const newDate = new Date(date);
      newDate.setMonth(0);
      newDate.setDate(1);
      newDate.setHours(0, 0, 0, 0);
      setDates([newDate]);
    } else if (view === 'agenda') {
      const newDate = new Date(date);
      newDate.setHours(0, 0, 0, 0);
      setDates([newDate]);
    }
  }, [
    date,
    locale,
    view,
    settings?.appearance?.showWeekends,
    settings?.appearance?.firstDayOfWeek,
    setDates,
  ]);

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

  // Keyboard shortcut to change view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
        // Ignore if typing in a form field
      }

      switch (e.key.toLowerCase()) {
        case 'd':
          enableDayView();
          break;
        case '4':
          enable4DayView();
          break;
        case 'w':
          enableWeekView();
          break;
        case 'm':
          enableMonthView();
          break;
        case 'y':
          enableYearView();
          break;
        case 'a':
          enableAgendaView();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    enableDayView,
    enable4DayView,
    enableWeekView,
    enableMonthView,
    enableYearView,
    enableAgendaView,
  ]);

  if (!initialized || !view || !dates.length) return null;

  return (
    <div
      className={cn(
        'grid h-full w-full',
        view === 'month' || view === 'year'
          ? 'grid-rows-[auto_1fr]'
          : 'grid-rows-[auto_auto_1fr]'
      )}
    >
      {enableHeader && (
        <CalendarHeader
          t={t}
          locale={locale}
          availableViews={availableViews}
          date={date}
          setDate={handleSetDate}
          view={view}
          offset={
            view === 'day'
              ? 1
              : view === '4-days'
                ? 4
                : view === 'week'
                  ? 7
                  : view === 'agenda'
                    ? 7
                    : 0
          }
          onViewChange={(newView) => {
            if (newView === 'day') enableDayView();
            else if (newView === '4-days') enable4DayView();
            else if (newView === 'week') enableWeekView();
            else if (newView === 'month') enableMonthView();
            else if (newView === 'year') enableYearView();
            else if (newView === 'agenda') enableAgendaView();
          }}
          extras={extras}
        />
      )}

      {view !== 'month' && view !== 'year' && view !== 'agenda' && (
        <WeekdayBar locale={locale} view={view} dates={dates} />
      )}

      <div
        className={cn(
          'scrollbar-none relative flex-1 overflow-auto focus:outline-none',
          view === 'agenda' ||
            view === 'month' ||
            view === 'year' ||
            'bg-background/50'
        )}
        onWheel={(e) => {
          // Ensure scroll events are always captured
          e.currentTarget.focus();
        }}
      >
        {view === 'month' && dates?.[0] ? (
          <MonthCalendar
            date={dates[0]}
            workspace={workspace}
            visibleDates={dates}
            viewedMonth={date}
            locale={locale}
          />
        ) : view === 'year' ? (
          <YearCalendar
            year={date.getFullYear()}
            locale={locale}
            showWeekends={settings?.appearance?.showWeekends !== false}
            firstDayOfWeek={getFirstDayOfWeekNumber(
              settings?.appearance?.firstDayOfWeek,
              locale
            )}
            onDayClick={(d) => {
              handleSetDate(d);
              enableDayView();
            }}
            onMonthClick={(d) => {
              handleSetDate(d);
              enableMonthView();
            }}
          />
        ) : view === 'agenda' && dates?.[0] ? (
          <AgendaView startDate={dates[0]} workspace={workspace} />
        ) : (
          <CalendarViewWithTrail dates={dates} overlay={overlay} />
        )}
      </div>

      {disabled ? null : workspace && <EventModal />}
    </div>
  );
};
