import type {
  Workspace,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types/db';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import type { CalendarView } from '@tuturuuu/ui/hooks/use-view-transition';
import { useViewTransition } from '@tuturuuu/ui/hooks/use-view-transition';
import { useCallback, useEffect, useState } from 'react';
import { CalendarHeader } from './calendar-header';
import { CalendarViewWithTrail } from './calendar-view-with-trail';
import { CreateEventButton } from './create-event-button';
import { EventModal } from './event-modal';
import { MonthCalendar } from './month-calendar';
import type { CalendarSettings } from './settings/settings-context';
import { SettingsButton } from './settings-button';
import { WeekdayBar } from './weekday-bar';

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
  initialSettings,
  enableHeader = true,
  experimentalGoogleToken,
  onSaveSettings,
  externalState,
  extras,
  onSidebarToggle,
  sidebarToggleButton,
}: {
  t: (key: string) => string;
  locale: string;
  disabled?: boolean;
  workspace?: Workspace;
  initialSettings?: Partial<CalendarSettings>;
  enableHeader?: boolean;
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
  onSaveSettings?: (settings: CalendarSettings) => Promise<void>;
  externalState?: {
    date: Date;
    setDate: React.Dispatch<React.SetStateAction<Date>>;
    view: 'day' | '4-days' | 'week' | 'month';
    setView: React.Dispatch<
      React.SetStateAction<'day' | '4-days' | 'week' | 'month'>
    >;
    availableViews: { value: string; label: string; disabled?: boolean }[];
  };
  extras?: React.ReactNode;
  onSidebarToggle?: () => void;
  sidebarToggleButton?: React.ReactNode;
}) => {
  const { transition } = useViewTransition();
  const { settings } = useCalendar();
  const { dates, setDates, isLoading, isSyncing } = useCalendarSync();

  const [initialized, setInitialized] = useState(false);
  const [date, setDate] = useState(externalState?.date || new Date());
  const [view, setView] = useState<CalendarView>(externalState?.view || 'week');
  const [availableViews, setAvailableViews] = useState<
    { value: string; label: string; disabled?: boolean }[]
  >(externalState?.availableViews || []);
  const [showLoadingSkeleton, setShowLoadingSkeleton] = useState(true);

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
    // Get the first day of week from settings
    const firstDayOfWeek = settings?.appearance?.firstDayOfWeek || 'monday';
    const showWeekends = settings?.appearance?.showWeekends !== false;

    console.log('Week view settings:', { firstDayOfWeek, showWeekends });

    // Convert firstDayOfWeek string to number (0 = Sunday, 1 = Monday, 6 = Saturday)
    const firstDayNumber =
      firstDayOfWeek === 'sunday'
        ? 0
        : firstDayOfWeek === 'monday'
          ? 1
          : firstDayOfWeek === 'saturday'
            ? 6
            : 1; // Default to Monday if invalid

    console.log(
      'First day of week:',
      firstDayOfWeek,
      'Number:',
      firstDayNumber
    );

    const getFirstDayOfWeek = () => {
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
      const firstDay = getFirstDayOfWeek();
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
  }, [
    date,
    transition,
    handleSetView,
    setDates,
    settings?.appearance?.firstDayOfWeek,
    settings?.appearance?.showWeekends,
  ]);

  const enableMonthView = useCallback(() => {
    let firstDayNumber = 1; // Monday
    if (settings?.appearance?.firstDayOfWeek === 'sunday') firstDayNumber = 0;
    if (settings?.appearance?.firstDayOfWeek === 'saturday') firstDayNumber = 6;
    const newDate = new Date(date);
    newDate.setDate(1);
    setView('month');
    setDate(newDate);
    const gridDates = getMonthGridDates(newDate, firstDayNumber);
    setDates(gridDates);
  }, [date, settings?.appearance?.firstDayOfWeek, setDates]);

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
      ]);
    }

    // Set initial view based on settings or external state
    if (externalState?.view) {
      if (externalState.view === 'day') enableDayView();
      else if (externalState.view === '4-days') enable4DayView();
      else if (externalState.view === 'week') enableWeekView();
      else if (externalState.view === 'month') enableMonthView();
    } else if (initialSettings?.appearance?.defaultView) {
      const defaultView = initialSettings.appearance.defaultView;
      if (defaultView === 'day') enableDayView();
      else if (defaultView === '4-days') enable4DayView();
      else if (defaultView === 'week') enableWeekView();
      else if (defaultView === 'month') enableMonthView();
    } else {
      // Default to week view if no setting is provided
      enableWeekView();
    }
  }, [
    t,
    initialized,
    initialSettings,
    enableDayView,
    enable4DayView,
    enableWeekView,
    enableMonthView,
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
      let firstDayNumber = 1; // Monday
      if (settings?.appearance?.firstDayOfWeek === 'sunday') firstDayNumber = 0;
      if (settings?.appearance?.firstDayOfWeek === 'saturday')
        firstDayNumber = 6;
      const gridDates = getMonthGridDates(date, firstDayNumber);
      setDates(gridDates);
    }
  }, [date, view, settings?.appearance?.firstDayOfWeek, setDates]);

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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableDayView, enable4DayView, enableWeekView, enableMonthView]);

  // Check if data is ready (for synchronized loading)
  const isDataReady = !isLoading && !isSyncing && dates.length > 0;

  // Hide loading skeleton after a minimum time to ensure users see it
  useEffect(() => {
    if (isDataReady) {
      const timer = setTimeout(() => {
        setShowLoadingSkeleton(false);
      }, 500); // Minimum 500ms loading time
      return () => clearTimeout(timer);
    }
  }, [isDataReady]);

  // Show loading skeleton while data is loading or during minimum loading time
  if (!initialized || !view || !dates.length || showLoadingSkeleton) {
    return (
      <div className="flex h-full w-full flex-col">
        {enableHeader && (
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  {sidebarToggleButton}
                  <div className="h-8 w-32 animate-pulse rounded bg-muted" />
                </div>
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <div className="flex flex-none items-center justify-center gap-2 md:justify-start">
                      <div className="h-8 w-8 animate-pulse rounded border bg-muted" />
                      <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                      <div className="h-8 w-8 animate-pulse rounded border bg-muted" />
                    </div>
                    <div className="h-8 w-24 animate-pulse rounded bg-muted" />
                  </div>
                  {extras}
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b bg-background/50">
            <div className="flex h-8 items-center justify-center">
              <div className="flex gap-1">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div
                    key={`weekday-skeleton-${i}`}
                    className="h-6 w-16 animate-pulse rounded bg-muted"
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="scrollbar-none relative flex-1 overflow-auto bg-background/50">
            <div className="flex h-full">
              <div className="w-16">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div key={`time-slot-${i}`} className="h-20" />
                ))}
              </div>
              <div className="flex-1">
                <div className="grid h-full grid-cols-7">
                  {Array.from({ length: 7 }).map((_, colIndex) => (
                    <div key={`calendar-col-${colIndex}`}>
                      {Array.from({ length: 24 }).map((_, rowIndex) => (
                        <div
                          key={`calendar-cell-${colIndex}-${rowIndex}`}
                          className="h-20"
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isDataReady) {
    return (
      <div className="flex h-full w-full flex-col">
        {enableHeader && (
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="p-4">
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
                        : 0
                }
                onViewChange={(newView) => {
                  if (newView === 'day') enableDayView();
                  else if (newView === '4-days') enable4DayView();
                  else if (newView === 'week') enableWeekView();
                  else if (newView === 'month') enableMonthView();
                }}
                extras={extras}
                onSidebarToggle={onSidebarToggle}
                sidebarToggleButton={sidebarToggleButton}
              />
            </div>
          </div>
        )}
        <div className="flex flex-1 flex-col overflow-hidden">
          {view !== 'month' && (
            <div className="bg-background/50">
              <WeekdayBar locale={locale} view={view} dates={dates} />
            </div>
          )}
          <div className="scrollbar-none relative flex-1 overflow-auto bg-background/50">
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-muted-foreground text-sm">
                  {isLoading
                    ? 'Loading calendar data...'
                    : 'Syncing calendar...'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      {enableHeader && (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="p-4">
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
                      : 0
              }
              onViewChange={(newView) => {
                if (newView === 'day') enableDayView();
                else if (newView === '4-days') enable4DayView();
                else if (newView === 'week') enableWeekView();
                else if (newView === 'month') enableMonthView();
              }}
              extras={extras}
              onSidebarToggle={onSidebarToggle}
              sidebarToggleButton={sidebarToggleButton}
            />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {view !== 'month' && (
          <div className="bg-background/50">
            <WeekdayBar locale={locale} view={view} dates={dates} />
          </div>
        )}

        <div className="relative flex-1 overflow-auto bg-background/50">
          {/* Add CSS to hide scrollbars */}
          <style jsx>{`
            .flex-1::-webkit-scrollbar {
              display: none;
            }
            .flex-1 {
              -ms-overflow-style: none;
              scrollbar-width: none;
            }
          `}</style>
          {view === 'month' && dates?.[0] ? (
            <MonthCalendar
              date={dates[0]}
              workspace={workspace}
              visibleDates={dates}
              viewedMonth={date}
            />
          ) : (
            <CalendarViewWithTrail dates={dates} />
          )}
        </div>
      </div>

      {disabled ? null : (
        <>
          {workspace && <EventModal />}
          <CreateEventButton />
          {workspace?.id && (
            <SettingsButton
              wsId={workspace?.id}
              experimentalGoogleToken={experimentalGoogleToken}
              initialSettings={initialSettings}
              onSaveSettings={onSaveSettings}
            />
          )}
        </>
      )}
    </div>
  );
};
