'use client';

import { CalendarProvider, useCalendar } from '../../../../hooks/use-calendar';
import CalendarHeader from './CalendarHeader';
import { CalendarSettingsDialog } from './CalendarSettingsDialog';
import CalendarViewWithTrail from './CalendarViewWithTrail';
import MonthCalendar from './MonthCalendar';
import { UnifiedEventModal } from './UnifiedEventModal';
import WeekdayBar from './WeekdayBar';
import { CalendarSettings, CategoryTimeSetting, CategoryTimeSettings } from './settings/CalendarSettingsContext';
import { Workspace } from '@tuturuuu/types/primitives/Workspace';
import { Button } from '@tuturuuu/ui/button';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import {
  type CalendarView,
  useViewTransition,
} from '@tuturuuu/ui/hooks/use-view-transition';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { Link, Loader2, PlusIcon, Settings, Sparkles, Clock } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { 
  Dialog,
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@tuturuuu/ui/dialog';
import { CategoryTimeConfigDialog } from './CategoryTimeConfigDialog';

// Floating action button for quick event creation
const CreateEventButton = () => {
  const { openModal } = useCalendar();

  return (
    <div className="fixed right-6 bottom-6 z-10 flex gap-2">
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

// Settings button component
const SettingsButton = ({
  showSyncButton = false,
  initialSettings,
  onSaveSettings,
}: {
  showSyncButton?: boolean;
  initialSettings?: Partial<CalendarSettings>;
  onSaveSettings?: (settings: CalendarSettings) => Promise<void>;
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [timeConfigOpen, setTimeConfigOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const { updateSettings, settings, syncAllFromGoogleCalendar } = useCalendar();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncGoogleCalendar = async () => {
    setIsSyncing(true);
    try {
      await syncAllFromGoogleCalendar();
      toast({
        title: 'Success',
        description: 'Google Calendar events synced successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to sync Google Calendar events',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveSettings = async (newSettings: CalendarSettings) => {
    console.log('Saving settings from dialog:', newSettings);

    // Update the calendar context with the new settings
    updateSettings(newSettings);

    // Call the parent's onSaveSettings if provided
    if (onSaveSettings) {
      await onSaveSettings(newSettings);
    }

    // Force localStorage save
    try {
      localStorage.setItem('calendarSettings', JSON.stringify(newSettings));
      console.log('Manually saved settings to localStorage');
    } catch (error) {
      console.error('Failed to manually save settings to localStorage:', error);
    }
  };
  
  // Handling when saving time settings for category
  const handleSaveCategoryTimeSettings = (timeSettings: CategoryTimeSettings) => {
    if (!timeSettings) {
      console.error('Invalid category time settings:', timeSettings);
      toast({
        title: 'Error',
        description: 'Invalid category time settings',
        variant: 'destructive'
      });
      return;
    }
    
    // Update settings with new timeSettings
    const newSettings = {
      ...settings,
      smartScheduling: {
        ...settings.smartScheduling,
        categoryTimeSettings: timeSettings
      }
    };
    
    // Update settings
    updateSettings(newSettings);
    
    // Log successful update for debugging
    console.log('Updated categoryTimeSettings:', timeSettings);
    
    toast({
      title: 'Success',
      description: 'Category time settings saved successfully',
    });
  };
  
  // Open the time settings dialog for a specific category
  const openTimeConfigForCategory = (categoryName: string) => {
    setSelectedCategory(categoryName);
    setTimeConfigOpen(true);
  };

  return (
    <div className="fixed right-6 bottom-24 z-10 flex gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg"
            onClick={() => setOpen(true)}
          >
            <Settings className="h-5 w-5" />
            <span className="sr-only">Calendar settings</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Calendar settings</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg"
            onClick={() => setTimeConfigOpen(true)}
          >
            <Clock className="h-5 w-5" />
            <span className="sr-only">Smart Scheduling Settings</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Smart Scheduling Settings</TooltipContent>
      </Tooltip>
      {showSyncButton && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full shadow-lg"
              onClick={handleSyncGoogleCalendar}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Link className="h-5 w-5" />
              )}
              <span className="sr-only">Sync Google Calendar</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Sync Google Calendar</TooltipContent>
        </Tooltip>
      )}
      <CalendarSettingsDialog
        open={open}
        onOpenChange={setOpen}
        initialSettings={settings}
        onSave={handleSaveSettings}
      />
      {/* Dialog to set time for each category */}
      {settings?.categoryColors?.categories && (
        <CategoryTimeConfigDialog
          open={timeConfigOpen}
          onOpenChange={setTimeConfigOpen}
          currentSettings={settings.smartScheduling?.categoryTimeSettings}
          onSave={handleSaveCategoryTimeSettings}
          selectedCategory={selectedCategory}
        />
      )}
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
  initialSettings,
  enableHeader = true,
  experimentalGoogleCalendarLinked = false,
  enableExperimentalGoogleCalendar = false,
  onSaveSettings,
  externalState,
}: {
  t: any;
  locale: string;
  useQuery: any;
  useQueryClient: any;
  workspace?: Workspace;
  disabled?: boolean;
  initialSettings?: Partial<CalendarSettings>;
  enableHeader?: boolean;
  experimentalGoogleCalendarLinked?: boolean;
  enableExperimentalGoogleCalendar?: boolean;
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
}) => {
  return (
    <CalendarProvider
      ws={workspace}
      useQuery={useQuery}
      useQueryClient={useQueryClient}
      initialSettings={initialSettings}
      enableExperimentalGoogleCalendar={enableExperimentalGoogleCalendar}
    >
      <CalendarContent
        t={t}
        locale={locale}
        disabled={disabled}
        workspace={workspace}
        initialSettings={initialSettings}
        enableHeader={enableHeader}
        experimentalGoogleCalendarLinked={experimentalGoogleCalendarLinked}
        enableExperimentalGoogleCalendar={enableExperimentalGoogleCalendar}
        onSaveSettings={onSaveSettings}
        externalState={externalState}
      />
    </CalendarProvider>
  );
};

// Separate component to access the CalendarProvider context
const CalendarContent = ({
  t,
  locale,
  disabled,
  workspace,
  initialSettings,
  enableHeader = true,
  experimentalGoogleCalendarLinked,
  enableExperimentalGoogleCalendar,
  onSaveSettings,
  externalState,
}: {
  t: any;
  locale: string;
  disabled?: boolean;
  workspace?: Workspace;
  initialSettings?: Partial<CalendarSettings>;
  enableHeader?: boolean;
  experimentalGoogleCalendarLinked?: boolean;
  enableExperimentalGoogleCalendar?: boolean;
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
}) => {
  const { transition } = useViewTransition();
  const { settings, rescheduleEvents } = useCalendar();
  const { toast } = useToast();
  
  const [initialized, setInitialized] = useState(false);
  const [date, setDate] = useState(externalState?.date || new Date());
  const [view, setView] = useState<CalendarView>(externalState?.view || 'week');
  const [dates, setDates] = useState<Date[]>([]);
  const [availableViews, setAvailableViews] = useState<
    { value: string; label: string; disabled?: boolean }[]
  >(externalState?.availableViews || []);
  const [isAIScheduling, setIsAIScheduling] = useState(false);
  const [showAIScheduleConfirmation, setShowAIScheduleConfirmation] = useState(false);

  // AI Scheduling confirmation handler
  const handleAIScheduleClick = () => {
    setShowAIScheduleConfirmation(true);
  };
  
  // AI Scheduling handler
  const handleAISchedule = async () => {
    setShowAIScheduleConfirmation(false);
    
    try {
      setIsAIScheduling(true);
      console.log("🚀 Starting AI Scheduling process...");
      
      // Calculate the period based on the view
      let periodStart: Date;
      let periodEnd: Date;
      
      if (view === 'day') {
        // Day view: get today
        periodStart = new Date(date);
        periodStart.setHours(0, 0, 0, 0);
        
        periodEnd = new Date(date);
        periodEnd.setHours(23, 59, 59, 999);
      } 
      else if (view === '4-days') {
        // 4 days view: from today to 3 days after
        periodStart = new Date(date);
        periodStart.setHours(0, 0, 0, 0);
        
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodStart.getDate() + 3);
        periodEnd.setHours(23, 59, 59, 999);
      }
      else if (view === 'week') {
        // Week view: get 7 days from the start of the week
        const currentDate = new Date(date);
        const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, ...
        periodStart = new Date(currentDate);
        periodStart.setDate(currentDate.getDate() - dayOfWeek); // Set to Sunday
        periodStart.setHours(0, 0, 0, 0); 
        
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodStart.getDate() + 6); // Until Saturday
        periodEnd.setHours(23, 59, 59, 999);
      }
      else if (view === 'month') {
        // Month view: get the entire month
        const currentDate = new Date(date);
        periodStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        periodStart.setHours(0, 0, 0, 0);
        
        periodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        periodEnd.setHours(23, 59, 59, 999);
      }
      else {
        // Default to today
        periodStart = new Date(date);
        periodStart.setHours(0, 0, 0, 0);
        
        periodEnd = new Date(date);
        periodEnd.setHours(23, 59, 59, 999);
      }
      
      console.log('AI Schedule for the period:', {
        view,
        start: periodStart.toISOString(),
        end: periodEnd.toISOString()
      });
      
      const result = await rescheduleEvents(periodStart, periodEnd, view);
      
      if (result) {
        // Analyze results
        const fixedEvents = result.filter(event => event.locked || event.priority === 'high');
        const rescheduledEvents = result.filter(event => !event.locked && event.priority !== 'high');
        
        // Count events for each category
        const categoryCount: Record<string, number> = {};
        rescheduledEvents.forEach(event => {
          const category = event.metadata?.category || 'Work';
          categoryCount[category] = (categoryCount[category] || 0) + 1;
        });
        
        // Create classified notifications
        const categoryDetails = Object.entries(categoryCount)
          .map(([cat, count]) => `${cat}: ${count}`)
          .join(', ');
        
        console.log('Analyzed results:', {
          fixedEvents: fixedEvents.length,
          rescheduledEvents: rescheduledEvents.length,
          categoryCount
        });
        
        toast({
          title: "AI Schedule completed",
          description: `Optimized ${rescheduledEvents.length} events (${categoryDetails}), preserved ${fixedEvents.length} locked events.`,
        });
      } else {
        console.log('Done');
        toast({
          title: "AI Schedule completed",
          description: "Your calendar has been optimized based on event priorities and preferences.",
        });
      }
    } catch (error) {
      console.error('Error in AI scheduling:', error);
      toast({
        title: "AI Schedule failed",
        description: "An error occurred while optimizing your calendar",
        variant: "destructive",
      });
    } finally {
      setIsAIScheduling(false);
      console.log('Done');
    }
  };

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
  }, [date, transition, settings, handleSetView, setDates]);

  const enableMonthView = useCallback(() => {
    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);
    newDate.setDate(1); // First day of month

    transition('month', () => {
      handleSetView('month');
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
    <div
      className={cn(
        'grid h-[calc(100%-2rem-4px)] w-full',
        view === 'month' ? 'grid-rows-[auto_1fr]' : 'grid-rows-[auto_auto_1fr]'
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
            view === 'day' ? 1 : view === '4-days' ? 4 : view === 'week' ? 7 : 0
          }
          onViewChange={(newView) => {
            if (newView === 'day') enableDayView();
            else if (newView === '4-days') enable4DayView();
            else if (newView === 'week') enableWeekView();
            else if (newView === 'month') enableMonthView();
          }}
          onAISchedule={isAIScheduling ? undefined : handleAIScheduleClick}
        />
      )}

      {view !== 'month' && (
        <WeekdayBar locale={locale} view={view} dates={dates} />
      )}

      <div className="relative scrollbar-none flex-1 overflow-hidden">
        {isAIScheduling && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 z-50">
            <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-background shadow-lg">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Optimizing your calendar</p>
            </div>
          </div>
        )}
        
        {view === 'month' && dates?.[0] ? (
          <MonthCalendar date={dates[0]} workspace={workspace} />
        ) : (
          <CalendarViewWithTrail dates={dates} />
        )}
      </div>

      {/* AI Schedule Confirmation Dialog */}
      <Dialog open={showAIScheduleConfirmation} onOpenChange={setShowAIScheduleConfirmation}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Intelligent Calendar Optimization
            </DialogTitle>
            <DialogDescription>
              Our AI will analyze your schedule and optimize event placement based on your configured time preferences, event priorities, and productivity patterns.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2 pt-4">
            <p className="text-sm font-medium">How Smart Scheduling Works:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
              <li><span className="font-medium">Preserves locked events</span> - Events marked as locked or high priority remain unchanged</li>
              <li><span className="font-medium">Respects time slots</span> - Events are placed within your defined category time slots</li>
              <li><span className="font-medium">Prioritizes important work</span> - Higher priority events get scheduled first</li>
              <li><span className="font-medium">Prevents overlaps</span> - Ensures no double-booking in your schedule</li>
              <li><span className="font-medium">Maintains same-day scheduling</span> - Events stay on their original day</li>
            </ul>

            <div className="mt-4 p-3 bg-muted rounded-md">
              <p className="text-sm flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-primary" />
                <span className="font-medium">Important:</span> For best results, configure time slots for each category in Settings → Smart Scheduling.
              </p>
            </div>
            
            <div className="mt-2 text-sm text-muted-foreground">
              <p>Smart Scheduling will:</p>
              <ol className="pl-5 mt-1 list-decimal space-y-1">
                <li>Check each event's category (Work, Personal, etc.)</li>
                <li>Place events in their category's configured time slots</li>
                <li>Schedule higher priority events first, then lower priority</li>
                <li>Keep events on their original day</li>
                <li>Update your database immediately after scheduling</li>
              </ol>
            </div>
            
            <div className="mt-2 text-sm bg-blue-50 dark:bg-blue-950 p-2 rounded-md">
              <p className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300 font-medium">
                <Sparkles className="h-4 w-4" />
                Event Priority Tip
              </p>
              <p className="mt-1 text-blue-600 dark:text-blue-400">Set event priority to control scheduling preference: High priority events are scheduled first in optimal slots.</p>
            </div>
          </div>
          
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowAIScheduleConfirmation(false)}>
              Cancel
            </Button>
            <Button onClick={handleAISchedule} className="gap-1.5 bg-primary hover:bg-primary/90">
              <Sparkles className="h-4 w-4" />
              Optimize Calendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {disabled ? null : (
        <>
          {workspace && (
            <UnifiedEventModal
              wsId={workspace.id}
              experimentalGoogleCalendarLinked={
                experimentalGoogleCalendarLinked
              }
              enableExperimentalGoogleCalendar={
                enableExperimentalGoogleCalendar
              }
            />
          )}
          <CreateEventButton />
          <SettingsButton
            showSyncButton={
              !!workspace?.id &&
              experimentalGoogleCalendarLinked &&
              enableExperimentalGoogleCalendar
            }
            initialSettings={initialSettings}
            onSaveSettings={onSaveSettings}
          />
        </>
      )}
    </div>
  );
};

export default Calendar;
