'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { Button } from '@tuturuuu/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem
} from '@tuturuuu/ui/dropdown-menu';
import { Settings, Calendar, Grid3X3, Info, ChevronLeft, ChevronRight, LayoutDashboard } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import relativeTime from 'dayjs/plugin/relativeTime';
import isBetween from 'dayjs/plugin/isBetween';
import { useState, useMemo, useEffect, useCallback } from 'react';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);
dayjs.extend(relativeTime);
dayjs.extend(isBetween);

interface ActivityHeatmapProps {
  dailyActivity: Array<{
    date: string;
    duration: number;
    sessions: number;
  }>;
  // eslint-disable-next-line no-unused-vars
  formatDuration: (seconds: number) => string;
  settings?: HeatmapSettings;
}

type HeatmapViewMode = 'original' | 'hybrid' | 'calendar-only' | 'compact-cards';

interface HeatmapSettings {
  viewMode: HeatmapViewMode;
  timeReference: 'relative' | 'absolute' | 'smart';
  showOnboardingTips: boolean;
}

export function ActivityHeatmap({
  dailyActivity,
  formatDuration,
  settings: externalSettings,
}: ActivityHeatmapProps) {
  const [internalSettings, setInternalSettings] = useState<HeatmapSettings>({
    viewMode: 'original',
    timeReference: 'smart',
    showOnboardingTips: true,
  });

  // Smart onboarding tips state - separate from general settings for better control
  const [onboardingState, setOnboardingState] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('time-tracker-onboarding');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Check if user dismissed tips recently (within 7 days)
          if (parsed.dismissedAt) {
            const dismissedDate = new Date(parsed.dismissedAt);
            const daysSinceDismissed = Math.floor((Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24));
            
            // If dismissed recently, don't show tips
            if (daysSinceDismissed < 7) {
              return { 
                showTips: false, 
                dismissedAt: parsed.dismissedAt,
                viewCount: parsed.viewCount || 0,
                lastViewMode: parsed.lastViewMode || 'original'
              };
            }
          }
          return { 
            showTips: true, 
            dismissedAt: null,
            viewCount: parsed.viewCount || 0,
            lastViewMode: parsed.lastViewMode || 'original'
          };
        } catch {
          // Fall through to default
        }
      }
    }
    return { 
      showTips: true, 
      dismissedAt: null,
      viewCount: 0,
      lastViewMode: 'original'
    };
  });

  // Use external settings if provided, otherwise use internal settings
  const settings = externalSettings || internalSettings;
  
  // Auto-hide tips after 30 seconds of inactivity (optional enhancement)
  const [tipAutoHideTimer, setTipAutoHideTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Smart logic: Only show onboarding tips when appropriate
  const shouldShowOnboardingTips = useMemo(() => {
    // Don't show if user explicitly disabled in settings
    if (!settings.showOnboardingTips) return false;
    
    // Don't show if recently dismissed
    if (!onboardingState.showTips) return false;
    
    // Show for new users (< 3 views) or when switching view modes
    const isNewUser = onboardingState.viewCount < 3;
    const changedViewMode = onboardingState.lastViewMode !== settings.viewMode;
    
    // Show for experienced users occasionally (every 14 days after 10+ views)
    const isPeriodicReminder = onboardingState.viewCount >= 10 && 
      (!onboardingState.dismissedAt || 
       Math.floor((Date.now() - new Date(onboardingState.dismissedAt).getTime()) / (1000 * 60 * 60 * 24)) >= 14);
    
    return isNewUser || changedViewMode || isPeriodicReminder;
  }, [settings.showOnboardingTips, onboardingState, settings.viewMode]);

  // Track view mode changes and update count
  useEffect(() => {
    if (settings.viewMode !== onboardingState.lastViewMode) {
      const newState = {
        ...onboardingState,
        viewCount: onboardingState.viewCount + 1,
        lastViewMode: settings.viewMode,
        showTips: true, // Reset to show tips when view mode changes
        dismissedAt: null
      };
      setOnboardingState(newState);
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('time-tracker-onboarding', JSON.stringify(newState));
      }
    }
  }, [settings.viewMode, onboardingState]);

  // Handle tip dismissal
  const handleDismissTips = useCallback(() => {
    const newState = {
      ...onboardingState,
      showTips: false,
      dismissedAt: new Date().toISOString()
    };
    setOnboardingState(newState);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('time-tracker-onboarding', JSON.stringify(newState));
    }

    // Also update parent settings if external settings provided
    if (externalSettings && typeof window !== 'undefined') {
      const currentHeatmapSettings = localStorage.getItem('heatmap-settings');
      if (currentHeatmapSettings) {
        try {
          const parsed = JSON.parse(currentHeatmapSettings);
          const updated = { ...parsed, showOnboardingTips: false };
          localStorage.setItem('heatmap-settings', JSON.stringify(updated));
          
          // Dispatch a custom event to notify parent component
          window.dispatchEvent(new CustomEvent('heatmap-settings-changed', { 
            detail: updated 
          }));
        } catch {
          // Silently fail
        }
      }
    }

    // Clear auto-hide timer if active
    if (tipAutoHideTimer) {
      clearTimeout(tipAutoHideTimer);
      setTipAutoHideTimer(null);
    }
  }, [onboardingState, externalSettings, tipAutoHideTimer]);

  // Set up auto-hide timer when tips are shown (optional - can be disabled)
  useEffect(() => {
    if (shouldShowOnboardingTips && onboardingState.viewCount >= 5) {
      // Only auto-hide for users who've seen tips multiple times
      const timer = setTimeout(() => {
        handleDismissTips();
      }, 45000); // Auto-hide after 45 seconds for experienced users
      
      setTipAutoHideTimer(timer);
      
      return () => {
        clearTimeout(timer);
      };
    }
  }, [shouldShowOnboardingTips, onboardingState.viewCount, handleDismissTips]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (tipAutoHideTimer) {
        clearTimeout(tipAutoHideTimer);
      }
    };
  }, [tipAutoHideTimer]);

  const [currentMonth, setCurrentMonth] = useState(dayjs().tz(dayjs.tz.guess()));

  const userTimezone = dayjs.tz.guess();
  const today = dayjs().tz(userTimezone);

  // Create a map of date strings to activity data
  const activityMap = new Map();
  dailyActivity?.forEach((activity) => {
    // Parse the date properly and convert to user timezone
    const activityDate = dayjs.utc(activity.date).tz(userTimezone);
    const dateStr = activityDate.format('YYYY-MM-DD');
    activityMap.set(dateStr, activity);
  });

  const weeks: Array<
    Array<{
      date: dayjs.Dayjs;
      activity: { duration: number; sessions: number } | null;
    } | null>
  > = [];

  // Start from 365 days ago
  const startDate = today.subtract(364, 'day');

  // Align to Monday (start of ISO week)
  const firstMonday = startDate.startOf('isoWeek');

  // Generate 53 weeks of data
  let currentDate = firstMonday;
  for (let week = 0; week < 53; week++) {
    const currentWeek = [];

    for (let day = 0; day < 7; day++) {
      const dateStr = currentDate.format('YYYY-MM-DD');
      const activity = activityMap.get(dateStr) as
        | { duration: number; sessions: number }
        | undefined;

      if (currentDate.isAfter(today, 'day')) {
        // Future dates
        currentWeek.push(null);
      } else {
        currentWeek.push({
          date: currentDate,
          activity: activity || null,
        });
      }

      currentDate = currentDate.add(1, 'day');
    }
    weeks.push(currentWeek);
  }

  // Get intensity level (0-4) based on duration
  const getIntensity = (duration: number): number => {
    if (duration === 0) return 0;
    if (duration < 1800) return 1; // < 30 minutes
    if (duration < 3600) return 2; // < 1 hour
    if (duration < 7200) return 3; // < 2 hours
    return 4; // 2+ hours
  };

  // Get color class based on intensity - minimal design
  const getColorClass = (intensity: number): string => {
    const colors = [
      'bg-gray-100 dark:bg-gray-800/50', // No activity
      'bg-emerald-200 dark:bg-emerald-900/60', // Low activity
      'bg-emerald-400 dark:bg-emerald-700/70', // Medium-low activity
      'bg-emerald-600 dark:bg-emerald-600/80', // Medium-high activity
      'bg-emerald-800 dark:bg-emerald-400/90', // High activity
    ];
    return colors[Math.max(0, Math.min(4, intensity))]!;
  };

  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  // Dynamically calculate month label positions
  const monthLabels: Array<{ label: string; weekIndex: number }> = [];
  let lastMonth = -1;

  weeks.forEach((week, weekIndex) => {
    // Find the first day of the week to check for month boundaries
    const firstDayOfWeek = week.find((day) => day !== null);
    if (firstDayOfWeek) {
      const month = firstDayOfWeek.date.month();
      const dayOfMonth = firstDayOfWeek.date.date();

      // Show month label if we're in the first week of the month and it's a different month
      if (month !== lastMonth && dayOfMonth <= 7) {
        monthLabels.push({
          label: monthNames[month]!,
          weekIndex,
        });
        lastMonth = month;
      }
    }
  });

  const totalDuration =
    dailyActivity?.reduce((sum, day) => sum + day.duration, 0) || 0;

  // Split weeks for different layouts
  // Mobile: 3 rows of ~4 months each (17-18 weeks per row)
  const mobileFirstRow = weeks.slice(0, 18);
  const mobileSecondRow = weeks.slice(18, 35);
  const mobileThirdRow = weeks.slice(35);

  // Desktop: 2 rows of ~6 months each (26-27 weeks per row)
  const desktopFirstRow = weeks.slice(0, 26);
  const desktopSecondRow = weeks.slice(26);

  // Helper function to render month labels for a subset of weeks
  const getMonthLabelsForWeeks = (weeksSubset: typeof weeks) => {
    const labels: Array<{ label: string; weekIndex: number }> = [];
    let lastMonth = -1;

    weeksSubset.forEach((week, weekIndex) => {
      const firstDayOfWeek = week.find((day) => day !== null);
      if (firstDayOfWeek) {
        const month = firstDayOfWeek.date.month();
        const dayOfMonth = firstDayOfWeek.date.date();

        if (month !== lastMonth && dayOfMonth <= 7) {
          labels.push({
            label: monthNames[month]!,
            weekIndex: weekIndex,
          });
          lastMonth = month;
        }
      }
    });

    return labels;
  };

  // Helper function to render a heatmap section
  const renderHeatmapSection = (
    weeksSubset: typeof weeks,
    sectionKey: string,
    isMobile = false
  ) => {
    // Calculate global index offset for proper unique keys
    let globalOffset = 0;
    if (sectionKey === 'mobile-second')
      globalOffset = mobileFirstRow.flat().length;
    if (sectionKey === 'mobile-third')
      globalOffset =
        mobileFirstRow.flat().length + mobileSecondRow.flat().length;
    if (sectionKey === 'desktop-second')
      globalOffset = desktopFirstRow.flat().length;

    return (
      <div className={cn('relative space-y-1.5 overflow-visible', isMobile ? 'space-y-1' : 'space-y-2')}>
        {/* Month Labels */}
        <div
          className="grid text-xs font-medium text-gray-500 dark:text-gray-400"
          style={{
            gridTemplateColumns: `repeat(${weeksSubset.length}, minmax(0, 1fr))`,
            gap: isMobile ? '1.5px' : '2.5px',
          }}
        >
          {getMonthLabelsForWeeks(weeksSubset).map(({ label, weekIndex }) => (
            <div
              key={`${sectionKey}-${label}-${weekIndex}`}
              className="text-center"
              style={{ gridColumnStart: weekIndex + 1 }}
            >
              <span
                className={cn(
                  isMobile ? 'text-[10px]' : 'text-xs',
                  'sm:hidden'
                )}
              >
                {label.slice(0, 1)}
              </span>
              <span className="hidden text-xs sm:inline">{label}</span>
            </div>
          ))}
        </div>
        {/* Grid with improved overflow handling */}
        <div
          className="relative grid grid-flow-col grid-rows-7 overflow-visible"
          style={{
            gridTemplateColumns: `repeat(${weeksSubset.length}, minmax(0, 1fr))`,
            gap: isMobile ? '1.5px' : '2.5px',
          }}
        >
          {weeksSubset.flat().map((day, index) => {
            const globalIndex = globalOffset + index;

            if (!day) {
              return (
                <div
                  key={globalIndex}
                  className={cn(
                    'aspect-square rounded-[2px] border border-gray-200/30 bg-gray-100/80 dark:border-gray-700/30 dark:bg-gray-800/60',
                    isMobile
                      ? 'min-h-[11px] min-w-[11px]'
                      : 'min-h-[13px] min-w-[13px] sm:min-h-[15px] sm:min-w-[15px]'
                  )}
                />
              );
            }

            const intensity = getIntensity(day.activity?.duration || 0);
            const isToday = day.date.isSame(today, 'day');

            return (
              <Tooltip key={globalIndex}>
                <TooltipTrigger asChild>
                  <button
                    className={cn(
                      'relative aspect-square rounded-[2px] transition-all duration-200 ease-out focus:outline-none',
                      isMobile
                        ? 'min-h-[11px] min-w-[11px]'
                        : 'min-h-[13px] min-w-[13px] sm:min-h-[15px] sm:min-w-[15px]',
                      getColorClass(intensity),
                      // Enhanced hover and focus states with better z-index
                      'hover:z-10 hover:scale-110 hover:shadow-lg hover:ring-2 hover:ring-emerald-400/60 hover:ring-offset-1',
                      'focus:z-10 focus:scale-110 focus:ring-2 focus:ring-emerald-400/50 focus:ring-offset-1',
                      'dark:hover:ring-emerald-500/50 dark:hover:ring-offset-gray-900',
                      'dark:focus:ring-emerald-500/50 dark:focus:ring-offset-gray-900',
                      // Today indicator with higher z-index
                      isToday &&
                        'z-20 shadow-lg ring-2 ring-blue-500/80 ring-offset-2 dark:ring-blue-400/70 dark:ring-offset-gray-900',
                      // Mobile specific hover states
                      isMobile && 'hover:scale-[1.2] sm:hover:scale-110'
                    )}
                    aria-label={`Activity for ${day.date.format('MMMM D, YYYY')}: ${
                      day.activity
                        ? formatDuration(day.activity.duration)
                        : 'No activity'
                    }`}
                  />
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="z-50 pointer-events-none max-w-sm border border-border/20 bg-white/98 p-3 shadow-2xl backdrop-blur-lg dark:bg-gray-900/98"
                  sideOffset={8}
                  avoidCollisions={true}
                  collisionPadding={8}
                >
                  <div className="space-y-2.5">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">
                      {day.date.format('dddd, MMMM D, YYYY')}
                                              {settings.timeReference === 'smart' && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {day.date.fromNow()} • {day.date.format('MMM D')}
                        </div>
                      )}
                    </div>
                    {day.activity ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div
                              className={cn(
                                'h-2.5 w-2.5 rounded-full shadow-sm',
                                intensity === 0
                                  ? 'bg-gray-400'
                                  : intensity === 1
                                    ? 'bg-emerald-300'
                                    : intensity === 2
                                      ? 'bg-emerald-400'
                                      : intensity === 3
                                        ? 'bg-emerald-500'
                                        : 'bg-emerald-600'
                              )}
                            />
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              {formatDuration(day.activity.duration)}
                            </span>
                          </div>
                          <span className="text-gray-500 dark:text-gray-400">
                            tracked
                          </span>
                        </div>
                        {day.activity.sessions > 0 && (
                          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                            <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                            <span>
                              {day.activity.sessions} session
                              {day.activity.sessions > 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                              <div
                                key={i}
                                className={cn(
                                  'h-1.5 w-1.5 rounded-full transition-colors',
                                  i < intensity
                                    ? 'bg-emerald-500'
                                    : 'bg-gray-300 dark:bg-gray-600'
                                )}
                              />
                            ))}
                          </div>
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            Level {intensity}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                        <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                        <span className="text-sm">No activity recorded</span>
                      </div>
                    )}
                    {isToday && (
                      <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-2.5 py-1.5 dark:bg-blue-900/40">
                        <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500 shadow-sm" />
                        <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                          Today
                        </span>
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    );
  };

  // Render year overview bars (simplified GitHub-style)
  const renderYearOverview = () => {
    const monthlyData = Array.from({ length: 12 }, (_, monthIndex) => {
      const monthStart = today.startOf('year').add(monthIndex, 'month');
      const monthEnd = monthStart.endOf('month');
      
      const monthActivity = dailyActivity?.filter(day => {
        const dayDate = dayjs.utc(day.date).tz(userTimezone);
        return dayDate.isBetween(monthStart, monthEnd, 'day', '[]');
      }) || [];
      
      const totalDuration = monthActivity.reduce((sum, day) => sum + day.duration, 0);
      const totalSessions = monthActivity.reduce((sum, day) => sum + day.sessions, 0);
      
      return {
        month: monthStart,
        duration: totalDuration,
        sessions: totalSessions,
        intensity: getIntensity(totalDuration / monthActivity.length || 0)
      };
    });

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {today.format('YYYY')} Activity Pattern
          </h4>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {dailyActivity?.length || 0} active days
          </span>
        </div>
        
        <div className="grid grid-cols-12 gap-2">
          {monthlyData.map((month, index) => (
            <Tooltip key={index}>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    'h-12 rounded-md transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-emerald-400/50',
                    getColorClass(month.intensity),
                    'flex flex-col items-center justify-center text-xs font-medium'
                  )}
                  onClick={() => setCurrentMonth(month.month)}
                >
                  <span className="text-[10px] opacity-60">
                    {month.month.format('MMM')}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                <div className="text-center">
                  <div className="font-medium">{month.month.format('MMMM YYYY')}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {formatDuration(month.duration)} • {month.sessions} sessions
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    );
  };

  // Render monthly calendar view
  const renderMonthlyCalendar = () => {
    const monthStart = currentMonth.startOf('month');
    const monthEnd = currentMonth.endOf('month');
    const calendarStart = monthStart.startOf('week');
    const calendarEnd = monthEnd.endOf('week');
    
    const days = [];
    let currentDay = calendarStart;
    
    while (currentDay.isBefore(calendarEnd) || currentDay.isSame(calendarEnd, 'day')) {
      const dayActivity = dailyActivity?.find(activity => {
        const activityDate = dayjs.utc(activity.date).tz(userTimezone);
        return activityDate.isSame(currentDay, 'day');
      });
      
      days.push({
        date: currentDay,
        activity: dayActivity || null,
        isCurrentMonth: currentDay.isSame(currentMonth, 'month'),
        isToday: currentDay.isSame(today, 'day')
      });
      
      currentDay = currentDay.add(1, 'day');
    }

    const monthlyStats = {
      activeDays: days.filter(day => day.activity && day.isCurrentMonth).length,
      totalDuration: days
        .filter(day => day.isCurrentMonth && day.activity)
        .reduce((sum, day) => sum + (day.activity?.duration || 0), 0),
      totalSessions: days
        .filter(day => day.isCurrentMonth && day.activity)
        .reduce((sum, day) => sum + (day.activity?.sessions || 0), 0)
    };

    return (
      <div className="space-y-3">
        {/* Month Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {currentMonth.format('MMMM YYYY')}
            </h4>
            <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
              <span>{monthlyStats.activeDays} active days</span>
              <span>{formatDuration(monthlyStats.totalDuration)} tracked</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(currentMonth.subtract(1, 'month'))}
              className="h-7 w-7"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(currentMonth.add(1, 'month'))}
              className="h-7 w-7"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="space-y-2">
          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="py-1 text-center">{day}</div>
            ))}
          </div>
          
          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((day, index) => {
              const intensity = getIntensity(day.activity?.duration || 0);
              
              return (
                <Tooltip key={index}>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        'relative h-8 w-full rounded-md text-xs font-medium transition-all focus:outline-none',
                        'hover:scale-105 hover:z-10 focus:scale-105 focus:z-10',
                        day.isCurrentMonth 
                          ? 'text-gray-900 dark:text-gray-100' 
                          : 'text-gray-400 dark:text-gray-600',
                        day.activity 
                          ? getColorClass(intensity)
                          : 'bg-gray-100/50 hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-800',
                        day.isToday && 'ring-2 ring-blue-500 ring-offset-1',
                        'flex items-center justify-center'
                      )}
                    >
                      {day.date.format('D')}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={4}>
                    <div className="space-y-1">
                      <div className="font-medium">
                        {day.date.format('dddd, MMMM D, YYYY')}
                        {settings.timeReference === 'smart' && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {day.date.fromNow()}
                          </div>
                        )}
                      </div>
                      {day.activity ? (
                        <div className="text-sm text-emerald-600 dark:text-emerald-400">
                          {formatDuration(day.activity.duration)} • {day.activity.sessions} sessions
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          No activity recorded
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderCompactCards = () => {
    // Group data by month for compact card display
    const monthlyData = weeks.reduce((acc, week) => {
      week.forEach(day => {
        // Add null check for day and day.activity
        if (day && day.activity) {
          const monthKey = day.date.format('YYYY-MM');
          const monthName = day.date.format('MMM YYYY');
          
          if (!acc[monthKey]) {
            acc[monthKey] = {
              name: monthName,
              totalDuration: 0,
              activeDays: 0,
              totalSessions: 0,
              dates: [] as typeof day[],
              weekdays: 0,
              weekends: 0,
              bestDay: { duration: 0, date: '' },
              longestStreak: 0,
              currentStreak: 0,
            };
          }
          
          acc[monthKey].totalDuration += day.activity.duration;
          acc[monthKey].totalSessions += day.activity.sessions;
          acc[monthKey].activeDays += 1;
          acc[monthKey].dates.push(day);
          
          // Track weekday vs weekend activity
          if (day.date.day() === 0 || day.date.day() === 6) {
            acc[monthKey].weekends += 1;
          } else {
            acc[monthKey].weekdays += 1;
          }
          
          // Track best day
          if (day.activity.duration > acc[monthKey].bestDay.duration) {
            acc[monthKey].bestDay = {
              duration: day.activity.duration,
              date: day.date.format('MMM D'),
            };
          }
        }
      });
      return acc;
    }, {} as Record<string, {
      name: string;
      totalDuration: number;
      activeDays: number;
      totalSessions: number;
      dates: any[];
      weekdays: number;
      weekends: number;
      bestDay: { duration: number; date: string };
      longestStreak: number;
      currentStreak: number;
    }>);

    // Calculate streaks for each month
    Object.values(monthlyData).forEach(monthData => {
      let currentStreak = 0;
      let longestStreak = 0;
      
      // Sort dates chronologically
      const sortedDates = monthData.dates.sort((a, b) => a.date.valueOf() - b.date.valueOf());
      
      for (let i = 0; i < sortedDates.length; i++) {
        if (sortedDates[i] && sortedDates[i].activity && sortedDates[i].activity.duration > 0) {
          currentStreak += 1;
          longestStreak = Math.max(longestStreak, currentStreak);
        } else {
          currentStreak = 0;
        }
      }
      
      monthData.longestStreak = longestStreak;
      monthData.currentStreak = currentStreak;
    });

    // Sort months chronologically (most recent first)
    const sortedMonths = Object.entries(monthlyData)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 12); // Show last 12 months

    // Calculate trends (compare with previous month)
    const monthsWithTrends = sortedMonths.map(([monthKey, data], index) => {
      const previousMonth = sortedMonths[index + 1];
      let trend = 'neutral' as 'up' | 'down' | 'neutral';
      let trendValue = 0;
      
      if (previousMonth) {
        const prevData = previousMonth[1];
        const currentAvg = data.totalDuration / Math.max(data.activeDays, 1);
        const prevAvg = prevData.totalDuration / Math.max(prevData.activeDays, 1);
        
        if (currentAvg > prevAvg * 1.1) trend = 'up';
        else if (currentAvg < prevAvg * 0.9) trend = 'down';
        
        trendValue = ((currentAvg - prevAvg) / Math.max(prevAvg, 1)) * 100;
      }
      
      return { monthKey, data, trend, trendValue };
    });

    // Calculate overall statistics for summary card
    const totalOverallDuration = sortedMonths.reduce((sum, [, data]) => sum + data.totalDuration, 0);
    const totalOverallSessions = sortedMonths.reduce((sum, [, data]) => sum + data.totalSessions, 0);
    const totalActiveDays = sortedMonths.reduce((sum, [, data]) => sum + data.activeDays, 0);
    const avgDailyOverall = totalActiveDays > 0 ? totalOverallDuration / totalActiveDays : 0;
    const avgSessionLength = totalOverallSessions > 0 ? totalOverallDuration / totalOverallSessions : 0;
    const overallFocusScore = avgSessionLength > 0 ? Math.min(100, Math.round((avgSessionLength / 3600) * 25)) : 0;

    // Determine if user is "established" enough to show upcoming month suggestions
    const isEstablishedUser = totalActiveDays >= 7 && totalOverallSessions >= 10 && sortedMonths.length >= 1;
    const hasRecentActivity = sortedMonths.length > 0 && dayjs().diff(dayjs().startOf('month'), 'day') < 15; // Active this month
    const shouldShowUpcoming = isEstablishedUser && hasRecentActivity;

    // Create all cards
    const allCards = [];
    
    // Add summary card if we have meaningful data (more than just a few sessions)
    if (sortedMonths.length > 0 && totalActiveDays >= 3) {
      allCards.push({
        type: 'summary',
        data: {
          totalDuration: totalOverallDuration,
          totalSessions: totalOverallSessions,
          activeDays: totalActiveDays,
          avgDaily: avgDailyOverall,
          avgSession: avgSessionLength,
          focusScore: overallFocusScore,
          monthCount: sortedMonths.length
        }
      });
    }

    // Add monthly data cards
    monthsWithTrends.forEach(({ monthKey, data, trend, trendValue }) => {
      allCards.push({
        type: 'monthly',
        monthKey,
        data,
        trend,
        trendValue
      });
    });

    // Only add upcoming months if user is established and we have space
    if (shouldShowUpcoming && allCards.length < 4) {
      const currentMonth = dayjs();
      const nextMonth = currentMonth.add(1, 'month');
      
      // Only add 1 upcoming month as a subtle suggestion
      allCards.push({
        type: 'upcoming',
        monthKey: nextMonth.format('YYYY-MM'),
        name: nextMonth.format('MMM YYYY'),
        isSubtle: true
      });
    }

    // Add getting started card if no meaningful data
    if (sortedMonths.length === 0 || totalActiveDays < 3) {
      allCards.unshift({
        type: 'getting-started'
      });
    }

    const [currentIndex, setCurrentIndex] = useState(0);
    const maxVisibleCards = 4;
    const totalCards = allCards.length;
    const canScrollLeft = currentIndex > 0;
    const canScrollRight = currentIndex < totalCards - maxVisibleCards;

    const scrollLeft = () => {
      if (canScrollLeft) {
        setCurrentIndex(prev => Math.max(0, prev - 1));
      }
    };

    const scrollRight = () => {
      if (canScrollRight) {
        setCurrentIndex(prev => Math.min(totalCards - maxVisibleCards, prev + 1));
      }
    };

    const visibleCards = allCards.slice(currentIndex, currentIndex + maxVisibleCards);

    return (
      <div className="relative">
        {/* Navigation Arrows - Only show if needed */}
        {totalCards > maxVisibleCards && (
          <>
            <button
              onClick={scrollLeft}
              disabled={!canScrollLeft}
              className={cn(
                'absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full border bg-background/80 backdrop-blur-sm shadow-md transition-all',
                canScrollLeft 
                  ? 'border-border hover:bg-accent hover:border-accent-foreground/20 text-foreground'
                  : 'border-muted text-muted-foreground cursor-not-allowed opacity-50'
              )}
              aria-label="Previous cards"
            >
              <ChevronLeft className="h-4 w-4 mx-auto" />
            </button>
            
            <button
              onClick={scrollRight}
              disabled={!canScrollRight}
              className={cn(
                'absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full border bg-background/80 backdrop-blur-sm shadow-md transition-all',
                canScrollRight 
                  ? 'border-border hover:bg-accent hover:border-accent-foreground/20 text-foreground'
                  : 'border-muted text-muted-foreground cursor-not-allowed opacity-50'
              )}
              aria-label="Next cards"
            >
              <ChevronRight className="h-4 w-4 mx-auto" />
            </button>
          </>
        )}

        {/* Cards Container */}
        <div className={cn("transition-all duration-300", totalCards > maxVisibleCards ? "mx-8" : "mx-0")}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {visibleCards.map((card) => {
              if (card.type === 'summary' && card.data) {
                return (
                  <div
                    key="summary"
                    className="group relative overflow-hidden rounded-lg border bg-gradient-to-br from-blue-50 to-indigo-50 p-3 shadow-sm transition-all hover:shadow-md dark:from-blue-950/20 dark:to-indigo-950/20 dark:border-blue-800/30"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="font-semibold text-sm text-blue-900 dark:text-blue-100">Overall</h4>
                        <span className="text-xs text-blue-600 dark:text-blue-300">{card.data.monthCount} month{card.data.monthCount > 1 ? 's' : ''}</span>
                      </div>
                      <div className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                        {card.data.focusScore}%
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                      <div>
                        <div className="text-blue-600 dark:text-blue-400">Total</div>
                        <div className="font-medium text-blue-900 dark:text-blue-100">{formatDuration(card.data.totalDuration)}</div>
                      </div>
                      <div>
                        <div className="text-blue-600 dark:text-blue-400">Daily</div>
                        <div className="font-medium text-blue-900 dark:text-blue-100">{formatDuration(Math.round(card.data.avgDaily))}</div>
                      </div>
                      <div>
                        <div className="text-blue-600 dark:text-blue-400">Sessions</div>
                        <div className="font-medium text-blue-900 dark:text-blue-100">{card.data.totalSessions}</div>
                      </div>
                      <div>
                        <div className="text-blue-600 dark:text-blue-400">Days</div>
                        <div className="font-medium text-blue-900 dark:text-blue-100">{card.data.activeDays}</div>
                      </div>
                    </div>
                    
                    <div className="pt-2 border-t border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        {card.data.activeDays < 7 ? 
                          `Great start! Building momentum.` :
                          `Avg session: ${formatDuration(Math.round(card.data.avgSession))}`
                        }
                      </p>
                    </div>
                  </div>
                );
              }

              if (card.type === 'monthly' && card.data) {
                const avgDailyDuration = card.data.activeDays > 0 ? card.data.totalDuration / card.data.activeDays : 0;
                const avgSessionLength = card.data.totalSessions > 0 ? card.data.totalDuration / card.data.totalSessions : 0;
                const focusScore = avgSessionLength > 0 ? Math.min(100, Math.round((avgSessionLength / 3600) * 25)) : 0;
                const consistencyScore = card.data.activeDays > 0 ? Math.round((card.data.activeDays / 31) * 100) : 0;
                
                return (
                  <div
                    key={(card as any).monthKey}
                    className="group relative overflow-hidden rounded-lg border bg-gradient-to-br from-green-50 to-emerald-50 p-3 shadow-sm transition-all hover:shadow-md dark:from-green-950/20 dark:to-emerald-950/20 dark:border-green-800/30"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="font-semibold text-sm text-green-900 dark:text-green-100">{(card.data as any).name}</h4>
                        <div className="flex items-center gap-1">
                          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          {(card as any).trend !== 'neutral' && (
                            <span className={cn(
                              'text-xs font-medium',
                              (card as any).trend === 'up' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            )}>
                              {(card as any).trend === 'up' ? '↗' : '↘'}{Math.abs((card as any).trendValue).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">
                        {focusScore}%
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                      <div>
                        <div className="text-green-600 dark:text-green-400">Total</div>
                        <div className="font-medium text-green-900 dark:text-green-100">{formatDuration(card.data.totalDuration)}</div>
                      </div>
                      <div>
                        <div className="text-green-600 dark:text-green-400">Daily</div>
                        <div className="font-medium text-green-900 dark:text-green-100">{formatDuration(Math.round(avgDailyDuration))}</div>
                      </div>
                      <div>
                        <div className="text-green-600 dark:text-green-400">Sessions</div>
                        <div className="font-medium text-green-900 dark:text-green-100">{card.data.totalSessions}</div>
                      </div>
                      <div>
                        <div className="text-green-600 dark:text-green-400">Days</div>
                        <div className="font-medium text-green-900 dark:text-green-100">{card.data.activeDays}</div>
                      </div>
                    </div>

                    {/* Mini Heatmap */}
                    <div className="mb-2">
                      <div className="grid grid-cols-7 gap-px">
                        {Array.from({ length: 7 * 4 }, (_, i) => {
                          const monthStart = dayjs((card as any).monthKey + '-01');
                          const dayOffset = i - monthStart.day();
                          const currentDay = monthStart.add(dayOffset, 'day');
                          
                          const dayActivity = (card.data as any).dates.find((d: any) => 
                            d && d.date && d.date.format('YYYY-MM-DD') === currentDay.format('YYYY-MM-DD')
                          );
                          
                          const isCurrentMonth = currentDay.month() === monthStart.month();
                          const dayIntensity = dayActivity && dayActivity.activity ? getIntensity(dayActivity.activity.duration) : 0;
                          
                          return (
                            <div
                              key={i}
                              className={cn(
                                'aspect-square rounded-[1px] transition-all',
                                isCurrentMonth
                                  ? (dayActivity && dayActivity.activity)
                                    ? getColorClass(dayIntensity)
                                    : 'bg-green-100 dark:bg-green-900/30'
                                  : 'bg-transparent'
                              )}
                            />
                          );
                        })}
                      </div>
                    </div>
                    
                    <div className="pt-2 border-t border-green-200 dark:border-green-800">
                      <p className="text-xs text-green-700 dark:text-green-300">
                        {consistencyScore >= 80 ? 'Excellent consistency!' : 
                         consistencyScore >= 50 ? 'Good habits forming' :
                         'Building momentum'}
                      </p>
                    </div>
                  </div>
                );
              }

              if (card.type === 'upcoming') {
                return (
                  <div
                    key={`upcoming-${(card as any).monthKey}`}
                    className="group relative overflow-hidden rounded-lg border border-muted/40 bg-gradient-to-br from-muted/20 to-muted/10 p-3 transition-all hover:from-muted/30 hover:to-muted/20 backdrop-blur-sm opacity-60 hover:opacity-80"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="font-semibold text-sm text-muted-foreground/80">{(card as any).name}</h4>
                        <span className="text-xs text-muted-foreground/60">Next month</span>
                      </div>
                      <div className="px-2 py-1 rounded-full text-xs font-medium bg-muted/50 text-muted-foreground/70 backdrop-blur-sm">
                        Plan
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs mb-2 opacity-50">
                      <div>
                        <div className="text-muted-foreground/60">Target</div>
                        <div className="font-medium text-muted-foreground/60">Set goal</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground/60">Focus</div>
                        <div className="font-medium text-muted-foreground/60">Stay consistent</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground/60">Sessions</div>
                        <div className="font-medium text-muted-foreground/60">Plan ahead</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground/60">Growth</div>
                        <div className="font-medium text-muted-foreground/60">Keep going</div>
                      </div>
                    </div>

                    <div className="mb-2 opacity-30">
                      <div className="grid grid-cols-7 gap-px">
                        {Array.from({ length: 7 * 4 }, (_, i) => (
                          <div
                            key={i}
                            className="aspect-square rounded-[1px] bg-muted/50"
                          />
                        ))}
                      </div>
                    </div>
                    
                    <div className="pt-2 border-t border-muted/30">
                      <p className="text-xs text-muted-foreground/60">
                        Keep the momentum going! 🚀
                      </p>
                    </div>
                  </div>
                );
              }

              if (card.type === 'getting-started') {
                return (
                  <div
                    key="getting-started"
                    className="group relative overflow-hidden rounded-lg border bg-gradient-to-br from-purple-50 to-violet-50 p-3 shadow-sm transition-all hover:shadow-md dark:from-purple-950/20 dark:to-violet-950/20 dark:border-purple-800/30"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="font-semibold text-sm text-purple-900 dark:text-purple-100">Get Started</h4>
                        <span className="text-xs text-purple-600 dark:text-purple-300">Begin journey</span>
                      </div>
                      <div className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                        New
                      </div>
                    </div>
                    
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-1 rounded-full bg-purple-500" />
                        <span className="text-purple-700 dark:text-purple-300">Start timer session</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-1 rounded-full bg-purple-500" />
                        <span className="text-purple-700 dark:text-purple-300">Build daily habits</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-1 rounded-full bg-purple-500" />
                        <span className="text-purple-700 dark:text-purple-300">Track progress</span>
                      </div>
                    </div>
                    
                    <div className="pt-2 border-t border-purple-200 dark:border-purple-800 mt-3">
                      <p className="text-xs text-purple-700 dark:text-purple-300">
                        💡 Try 25-min Pomodoro sessions
                      </p>
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        </div>

        {/* Pagination Dots - Only show if needed */}
        {totalCards > maxVisibleCards && (
          <div className="flex justify-center mt-3 gap-1">
            {Array.from({ length: Math.ceil(totalCards / maxVisibleCards) }, (_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i * maxVisibleCards)}
                className={cn(
                  'h-2 w-2 rounded-full transition-all',
                  Math.floor(currentIndex / maxVisibleCards) === i
                    ? 'bg-primary'
                    : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                )}
                aria-label={`Go to page ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative space-y-4 overflow-visible sm:space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-100">
            Activity Heatmap
          </h3>
          <p className="text-sm text-gray-600 sm:text-base dark:text-gray-400">
            {totalDuration > 0
              ? `${formatDuration(totalDuration)} tracked this year`
              : 'Start tracking to see your activity pattern'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Mode Settings */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2 gap-1">
                <Settings className="h-3 w-3" />
                <span className="hidden sm:inline text-xs">View</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">Display Mode</DropdownMenuLabel>
              {externalSettings && (
                <div className="px-2 py-1 text-xs text-muted-foreground">
                  Controlled by Timer Settings
                </div>
              )}
              <DropdownMenuItem 
                className="text-xs"
                onClick={() => !externalSettings && setInternalSettings(prev => ({ ...prev, viewMode: 'original' }))}
                disabled={!!externalSettings}
              >
                <Grid3X3 className="mr-2 h-3 w-3" />
                Original Grid
                {settings.viewMode === 'original' && <span className="ml-auto">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="text-xs"
                onClick={() => !externalSettings && setInternalSettings(prev => ({ ...prev, viewMode: 'hybrid' }))}
                disabled={!!externalSettings}
              >
                <Calendar className="mr-2 h-3 w-3" />
                Hybrid View
                {settings.viewMode === 'hybrid' && <span className="ml-auto">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="text-xs"
                onClick={() => !externalSettings && setInternalSettings(prev => ({ ...prev, viewMode: 'calendar-only' }))}
                disabled={!!externalSettings}
              >
                <Calendar className="mr-2 h-3 w-3" />
                Calendar Only
                {settings.viewMode === 'calendar-only' && <span className="ml-auto">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="text-xs"
                onClick={() => !externalSettings && setInternalSettings(prev => ({ ...prev, viewMode: 'compact-cards' }))}
                disabled={!!externalSettings}
              >
                <LayoutDashboard className="mr-2 h-3 w-3" />
                Compact Cards
                {settings.viewMode === 'compact-cards' && <span className="ml-auto">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">Options</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                className="text-xs"
                checked={settings.timeReference === 'smart'}
                onCheckedChange={(checked) => 
                  !externalSettings && setInternalSettings(prev => ({ 
                    ...prev, 
                    timeReference: checked ? 'smart' : 'relative' 
                  }))
                }
                disabled={!!externalSettings}
              >
                Show smart time references
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                className="text-xs"
                checked={settings.showOnboardingTips}
                onCheckedChange={(checked) => 
                  !externalSettings && setInternalSettings(prev => ({ ...prev, showOnboardingTips: checked }))
                }
                disabled={!!externalSettings}
              >
                Show helpful tips
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Legend */}
          <div className="flex items-center gap-2 rounded-lg bg-white/80 px-3 py-2 text-xs text-gray-600 shadow-sm ring-1 ring-gray-200/50 sm:gap-3 dark:bg-gray-800/80 dark:text-gray-400 dark:ring-gray-700/50">
            <span className="hidden font-medium sm:inline">Less</span>
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3, 4].map((intensity) => (
                <div
                  key={intensity}
                  className={cn(
                    'h-2.5 w-2.5 rounded-[2px] transition-transform hover:scale-125 sm:h-3 sm:w-3',
                    getColorClass(intensity)
                  )}
                  title={`Level ${intensity} intensity`}
                />
              ))}
            </div>
            <span className="hidden font-medium sm:inline">More</span>
          </div>
        </div>
      </div>

      {/* Smart Onboarding Tips */}
      {shouldShowOnboardingTips && (
        <div className="rounded-lg border border-blue-200/60 bg-blue-50/50 p-3 shadow-sm dark:border-blue-800/60 dark:bg-blue-950/30">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div className="space-y-2 text-sm flex-1">
              <div className="flex items-center justify-between">
                <p className="font-medium text-blue-900 dark:text-blue-100">
                  💡 {settings.viewMode === 'original' && 'GitHub-style Heatmap'}
                  {settings.viewMode === 'hybrid' && 'Interactive Hybrid View'}
                  {settings.viewMode === 'calendar-only' && 'Monthly Calendar View'}
                  {settings.viewMode === 'compact-cards' && 'Compact Card Overview'}
                </p>
                {onboardingState.viewCount > 0 && (
                  <span className="text-xs text-blue-600 dark:text-blue-400 opacity-75">
                    View #{onboardingState.viewCount + 1}
                  </span>
                )}
              </div>
              <p className="text-blue-700 dark:text-blue-300 leading-relaxed">
                {settings.viewMode === 'original' && "Track your productivity with GitHub-style visualization. Darker squares = more active days. Hover over any day for details, and use the View menu above to explore other layouts!"}
                {settings.viewMode === 'hybrid' && "Best of both worlds! Click any month bar in the year overview to jump to that month's detailed calendar below. Perfect for spotting patterns across the year."}
                {settings.viewMode === 'calendar-only' && "Navigate months with arrow buttons to see your activity patterns. Each colored square represents your activity level that day. Great for detailed daily analysis."}
                {settings.viewMode === 'compact-cards' && "Monthly summaries at a glance! Each card shows key stats with a mini heatmap preview. Scroll horizontally to see different months and track your progress over time."}
              </p>
              {onboardingState.viewCount >= 3 && (
                <p className="text-xs text-blue-600 dark:text-blue-400 opacity-80">
                  💭 Tip: You can always toggle these tips on/off in the View menu or Settings panel.
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors"
              onClick={handleDismissTips}
              title="Hide for 7 days (tips will return when switching view modes or after a week)"
              aria-label="Close onboarding tips"
            >
              ×
            </Button>
          </div>
        </div>
      )}

      {/* Render Different Views Based on Settings */}
      {settings.viewMode === 'original' && (
        <>
          {/* Mobile: Three-row layout */}
          <div className="block overflow-visible lg:hidden">
            <div className="space-y-6">
              {/* Day labels for mobile */}
              <div className="flex items-start gap-3 overflow-visible">
                <div className="flex w-8 flex-col justify-between gap-[2px] text-xs font-medium text-gray-500 dark:text-gray-400">
                  <span className="leading-none">M</span>
                  <span className="leading-none">T</span>
                  <span className="leading-none">W</span>
                  <span className="leading-none">T</span>
                  <span className="leading-none">F</span>
                  <span className="leading-none">S</span>
                  <span className="leading-none">S</span>
                </div>
                <div className="flex-1 overflow-visible">
                  {renderHeatmapSection(mobileFirstRow, 'mobile-first', true)}
                </div>
              </div>

              <div className="flex items-start gap-3 overflow-visible">
                <div className="flex w-8 flex-col justify-between gap-[2px] text-xs font-medium text-gray-500 dark:text-gray-400">
                  <span className="leading-none">M</span>
                  <span className="leading-none">T</span>
                  <span className="leading-none">W</span>
                  <span className="leading-none">T</span>
                  <span className="leading-none">F</span>
                  <span className="leading-none">S</span>
                  <span className="leading-none">S</span>
                </div>
                <div className="flex-1 overflow-visible">
                  {renderHeatmapSection(mobileSecondRow, 'mobile-second', true)}
                </div>
              </div>

              {/* Third row for mobile */}
              <div className="flex items-start gap-3 overflow-visible">
                <div className="flex w-8 flex-col justify-between gap-[2px] text-xs font-medium text-gray-500 dark:text-gray-400">
                  <span className="leading-none">M</span>
                  <span className="leading-none">T</span>
                  <span className="leading-none">W</span>
                  <span className="leading-none">T</span>
                  <span className="leading-none">F</span>
                  <span className="leading-none">S</span>
                  <span className="leading-none">S</span>
                </div>
                <div className="flex-1 overflow-visible">
                  {renderHeatmapSection(mobileThirdRow, 'mobile-third', true)}
                </div>
              </div>
            </div>
          </div>

          {/* Desktop: Two-row layout */}
          <div className="hidden overflow-visible lg:block">
            <div className="space-y-6">
              {/* Row 1: First 6 months */}
              <div className="flex gap-4 overflow-visible">
                <div className="flex flex-col justify-between text-sm font-semibold text-gray-500 dark:text-gray-400">
                  <span className="leading-none">Mon</span>
                  <span className="leading-none">Wed</span>
                  <span className="leading-none">Fri</span>
                </div>
                <div className="flex-1 overflow-visible">
                  {renderHeatmapSection(desktopFirstRow, 'desktop-first', false)}
                </div>
              </div>

              {/* Row 2: Last 6 months */}
              <div className="flex gap-4 overflow-visible">
                <div className="flex flex-col justify-between text-sm font-semibold text-gray-500 dark:text-gray-400">
                  <span className="leading-none">Mon</span>
                  <span className="leading-none">Wed</span>
                  <span className="leading-none">Fri</span>
                </div>
                <div className="flex-1 overflow-visible">
                  {renderHeatmapSection(desktopSecondRow, 'desktop-second', false)}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {settings.viewMode === 'hybrid' && (
        <div className="space-y-4">
          {/* Year Overview */}
          <div className="rounded-lg border border-gray-200/60 bg-gray-50/50 p-3 dark:border-gray-700/60 dark:bg-gray-800/30">
            {renderYearOverview()}
          </div>
          
          {/* Monthly Calendar */}
          <div className="rounded-lg border border-gray-200/60 bg-white/50 p-3 dark:border-gray-700/60 dark:bg-gray-900/30">
            {renderMonthlyCalendar()}
          </div>
        </div>
      )}

      {settings.viewMode === 'calendar-only' && (
        <div className="rounded-lg border border-gray-200/60 bg-white/50 p-3 dark:border-gray-700/60 dark:bg-gray-900/30">
          {renderMonthlyCalendar()}
        </div>
      )}

      {settings.viewMode === 'compact-cards' && renderCompactCards()}
    </div>
  );
}
