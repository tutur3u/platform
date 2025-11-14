'use client';

import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  Info,
  LayoutDashboard,
  Settings,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isoWeek from 'dayjs/plugin/isoWeek';
import relativeTime from 'dayjs/plugin/relativeTime';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import 'dayjs/locale/vi';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
}

type HeatmapViewMode =
  | 'original'
  | 'hybrid'
  | 'calendar-only'
  | 'compact-cards';

interface HeatmapSettings {
  viewMode: HeatmapViewMode;
  timeReference: 'relative' | 'absolute' | 'smart';
  showOnboardingTips: boolean;
}

const formatDuration = (seconds: number | undefined): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export function ActivityHeatmap({ dailyActivity }: ActivityHeatmapProps) {
  const t = useTranslations('time-tracker.heatmap');
  const locale = useLocale();
  dayjs.locale(locale);

  const [heatmapSettings] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('heatmap-settings');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // Fall through to default
        }
      }
    }
    return {
      viewMode: 'original' as 'original' | 'hybrid' | 'calendar-only',
      timeReference: 'smart' as 'relative' | 'absolute' | 'smart',
      showOnboardingTips: true,
    };
  });

  const [internalSettings, setInternalSettings] = useState<HeatmapSettings>({
    viewMode: 'original',
    timeReference: 'smart',
    showOnboardingTips: true,
  });

  useEffect(() => {
    setInternalSettings(heatmapSettings);
  }, [heatmapSettings]);

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
            const daysSinceDismissed = Math.floor(
              (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24)
            );

            // If dismissed recently, don't show tips
            if (daysSinceDismissed < 7) {
              return {
                showTips: false,
                dismissedAt: parsed.dismissedAt,
                viewCount: parsed.viewCount || 0,
                lastViewMode: parsed.lastViewMode || 'original',
              };
            }
          }
          return {
            showTips: true,
            dismissedAt: null,
            viewCount: parsed.viewCount || 0,
            lastViewMode: parsed.lastViewMode || 'original',
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
      lastViewMode: 'original',
    };
  });

  const settings = internalSettings;

  // Auto-hide tips after 30 seconds of inactivity (optional enhancement)
  const [tipAutoHideTimer, setTipAutoHideTimer] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

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
    const isPeriodicReminder =
      onboardingState.viewCount >= 10 &&
      (!onboardingState.dismissedAt ||
        Math.floor(
          (Date.now() - new Date(onboardingState.dismissedAt).getTime()) /
            (1000 * 60 * 60 * 24)
        ) >= 14);

    return isNewUser || changedViewMode || isPeriodicReminder;
  }, [
    settings.showOnboardingTips,
    settings.viewMode,
    onboardingState.showTips,
    onboardingState.viewCount,
    onboardingState.lastViewMode,
    onboardingState.dismissedAt,
  ]);

  // Track view mode changes and update count
  useEffect(() => {
    setOnboardingState((currentState) => {
      if (settings.viewMode !== currentState.lastViewMode) {
        const newState = {
          ...currentState,
          viewCount: currentState.viewCount + 1,
          lastViewMode: settings.viewMode,
          showTips: true, // Reset to show tips when view mode changes
          dismissedAt: null,
        };

        if (typeof window !== 'undefined') {
          localStorage.setItem(
            'time-tracker-onboarding',
            JSON.stringify(newState)
          );
        }

        return newState;
      }
      return currentState;
    });
  }, [settings.viewMode]);

  // Handle tip dismissal
  const handleDismissTips = useCallback(() => {
    setOnboardingState((currentState) => {
      const newState = {
        ...currentState,
        showTips: false,
        dismissedAt: new Date().toISOString(),
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem(
          'time-tracker-onboarding',
          JSON.stringify(newState)
        );
      }

      return newState;
    });

    // Clear auto-hide timer if active
    if (tipAutoHideTimer) {
      clearTimeout(tipAutoHideTimer);
      setTipAutoHideTimer(null);
    }
  }, [tipAutoHideTimer]);

  // Set up auto-hide timer when tips are shown (optional - can be disabled)
  // biome-ignore lint/correctness/useExhaustiveDependencies(handleDismissTips): suppress dependency array linting
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
  }, [shouldShowOnboardingTips, onboardingState.viewCount]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (tipAutoHideTimer) {
        clearTimeout(tipAutoHideTimer);
      }
    };
  }, [tipAutoHideTimer]);

  const [currentMonth, setCurrentMonth] = useState(
    dayjs().tz(dayjs.tz.guess())
  );

  const userTimezone = dayjs.tz.guess();
  const today = dayjs().tz(userTimezone);

  // Pre-compute week grid data structure - memoized to avoid recreating 371+ dayjs objects on every render
  const weekGridData = useMemo(() => {
    // Compute today inside memo to avoid stale closure and unnecessary recalculations
    const memoToday = dayjs().tz(userTimezone);

    const activityMap = new Map<
      string,
      { duration: number; sessions: number }
    >();
    dailyActivity?.forEach((activity) => {
      const activityDate = dayjs.utc(activity.date).tz(userTimezone);
      const dateStr = activityDate.format('YYYY-MM-DD');
      activityMap.set(dateStr, activity);
    });

    const weeks: Array<
      Array<{
        date: dayjs.Dayjs;
        dateStr: string;
        activity: { duration: number; sessions: number } | null;
      } | null>
    > = [];

    // Start from 365 days ago
    const startDate = memoToday.subtract(364, 'day');
    // Align to Monday (start of ISO week)
    const firstMonday = startDate.startOf('isoWeek');

    // Generate 53 weeks of data
    let currentDate = firstMonday;
    for (let week = 0; week < 53; week++) {
      const currentWeek = [];

      for (let day = 0; day < 7; day++) {
        const dateStr = currentDate.format('YYYY-MM-DD');
        const activity = activityMap.get(dateStr);

        if (currentDate.isAfter(memoToday, 'day')) {
          // Future dates
          currentWeek.push(null);
        } else {
          currentWeek.push({
            date: currentDate,
            dateStr,
            activity: activity || null,
          });
        }

        currentDate = currentDate.add(1, 'day');
      }
      weeks.push(currentWeek);
    }

    return { weeks, activityMap };
  }, [dailyActivity, userTimezone]);

  const weeks = weekGridData.weeks;

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

  const monthNames = useMemo(
    () => [
      t('months.jan'),
      t('months.feb'),
      t('months.mar'),
      t('months.apr'),
      t('months.may'),
      t('months.jun'),
      t('months.jul'),
      t('months.aug'),
      t('months.sep'),
      t('months.oct'),
      t('months.nov'),
      t('months.dec'),
    ],
    [t]
  );

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

  // Helper function to render a heatmap section - memoized to prevent recreation
  const renderHeatmapSection = useCallback(
    (weeksSubset: typeof weeks, sectionKey: string, isMobile = false) => {
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
        <div
          className={cn(
            'relative space-y-1.5 overflow-visible',
            isMobile ? 'space-y-1' : 'space-y-2'
          )}
        >
          {/* Month Labels */}
          <div
            className="grid font-medium text-gray-500 text-xs dark:text-gray-400"
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
                      '/30 aspect-square rounded-[2px] border bg-gray-100/80 dark:border-gray-700/30 dark:bg-gray-800/60',
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
                      type="button"
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
                      aria-label={t('aria.activityFor', {
                        date: day.date.format('MMMM D, YYYY'),
                        duration: day.activity
                          ? formatDuration(day.activity.duration)
                          : t('noActivity'),
                      })}
                    />
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="pointer-events-none z-50 max-w-sm border border-border/20 bg-white/98 p-3 shadow-2xl backdrop-blur-lg dark:bg-gray-900/98"
                    sideOffset={8}
                    avoidCollisions={true}
                    collisionPadding={8}
                  >
                    <div className="space-y-2.5">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">
                        {day.date.format('dd, DD/MM/YYYY')}
                        {settings.timeReference === 'smart' && (
                          <div className="mt-1 text-gray-500 text-xs dark:text-gray-400">
                            {day.date.fromNow()}
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
                              {t('tracked')}
                            </span>
                          </div>
                          {day.activity.sessions > 0 && (
                            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                              <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                              <span>
                                {t('sessions', {
                                  count: day.activity.sessions,
                                })}
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
                            <span className="font-medium text-gray-500 text-xs dark:text-gray-400">
                              {t('level', { level: intensity })}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                          <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                          <span className="text-sm">
                            {t('noActivityRecorded')}
                          </span>
                        </div>
                      )}
                      {isToday && (
                        <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-2.5 py-1.5 dark:bg-blue-900/40">
                          <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500 shadow-sm" />
                          <span className="font-semibold text-blue-600 text-sm dark:text-blue-400">
                            {t('today')}
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
    },
    [
      weeks,
      mobileFirstRow,
      mobileSecondRow,
      desktopFirstRow,
      today,
      settings.timeReference,
      t,
      getMonthLabelsForWeeks,
    ]
  );

  // Render year overview bars (simplified GitHub-style) - memoized
  const renderYearOverview = useCallback(() => {
    const monthlyData = Array.from({ length: 12 }, (_, monthIndex) => {
      const monthStart = today.startOf('year').add(monthIndex, 'month');
      const monthEnd = monthStart.endOf('month');

      const monthActivity =
        dailyActivity?.filter((day) => {
          const dayDate = dayjs.utc(day.date).tz(userTimezone);
          return dayDate.isBetween(monthStart, monthEnd, 'day', '[]');
        }) || [];

      const totalDuration = monthActivity.reduce(
        (sum, day) => sum + day.duration,
        0
      );
      const totalSessions = monthActivity.reduce(
        (sum, day) => sum + day.sessions,
        0
      );

      const avgDuration =
        monthActivity.length > 0 ? totalDuration / monthActivity.length : 0;

      return {
        month: monthStart,
        duration: totalDuration,
        sessions: totalSessions,
        intensity: getIntensity(avgDuration),
      };
    });

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-gray-700 text-sm dark:text-gray-300">
            {t('yearActivityPattern', { year: today.format('YYYY') })}
          </h4>
          <span className="text-gray-500 text-xs dark:text-gray-400">
            {t('activeDays', { count: dailyActivity?.length || 0 })}
          </span>
        </div>

        <div className="grid grid-cols-12 gap-2">
          {monthlyData.map((month, index) => (
            <Tooltip key={index}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'h-12 rounded-md transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-emerald-400/50',
                    getColorClass(month.intensity),
                    'flex flex-col items-center justify-center font-medium text-xs'
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
                  <div className="font-medium">
                    {month.month.format('MMMM YYYY')}
                  </div>
                  <div className="text-gray-500 text-sm dark:text-gray-400">
                    {formatDuration(month.duration)} •{' '}
                    {t('sessions', { count: month.sessions })}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    );
  }, [dailyActivity, userTimezone, today, t, setCurrentMonth]);

  // Render monthly calendar view - memoized
  const renderMonthlyCalendar = useCallback(() => {
    const monthStart = currentMonth.startOf('month');
    const monthEnd = currentMonth.endOf('month');
    const calendarStart = monthStart.startOf('week');
    const calendarEnd = monthEnd.endOf('week');

    const days = [];
    let currentDay = calendarStart;

    while (
      currentDay.isBefore(calendarEnd) ||
      currentDay.isSame(calendarEnd, 'day')
    ) {
      const dayActivity = dailyActivity?.find((activity) => {
        const activityDate = dayjs.utc(activity.date).tz(userTimezone);
        return activityDate.isSame(currentDay, 'day');
      });

      days.push({
        date: currentDay,
        activity: dayActivity || null,
        isCurrentMonth: currentDay.isSame(currentMonth, 'month'),
        isToday: currentDay.isSame(today, 'day'),
      });

      currentDay = currentDay.add(1, 'day');
    }

    const monthlyStats = {
      activeDays: days.filter((day) => day?.activity && day.isCurrentMonth)
        .length,
      totalDuration: days
        .filter((day) => day.isCurrentMonth && day?.activity)
        .reduce((sum, day) => sum + (day.activity?.duration || 0), 0),
      totalSessions: days
        .filter((day) => day.isCurrentMonth && day?.activity)
        .reduce((sum, day) => sum + (day.activity?.sessions || 0), 0),
    };

    return (
      <div className="space-y-3">
        {/* Month Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h4 className="font-semibold text-base text-gray-900 dark:text-gray-100">
              {currentMonth.format('MMMM YYYY')}
            </h4>
            <div className="flex items-center gap-3 text-gray-600 text-xs dark:text-gray-400">
              <span>{t('activeDays', { count: monthlyStats.activeDays })}</span>
              <span>
                {t('trackedDuration', {
                  duration: formatDuration(monthlyStats.totalDuration),
                })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => setCurrentMonth(currentMonth.subtract(1, 'month'))}
              className="h-7 w-7"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              type="button"
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
          <div className="grid grid-cols-7 gap-1.5 text-center font-medium text-gray-500 text-xs dark:text-gray-400">
            {[
              t('days.sun'),
              t('days.mon'),
              t('days.tue'),
              t('days.wed'),
              t('days.thu'),
              t('days.fri'),
              t('days.sat'),
            ].map((day) => (
              <div key={day} className="py-1 text-center">
                {day}
              </div>
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
                      type="button"
                      className={cn(
                        'relative h-8 w-full rounded-md font-medium text-xs transition-all focus:outline-none',
                        'hover:z-10 hover:scale-105 focus:z-10 focus:scale-105',
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
                        {day.date.format('dddd, DD/MM/YYYY')}
                        {settings.timeReference === 'smart' && (
                          <div className="text-gray-500 text-xs dark:text-gray-400">
                            {day.date.fromNow()}
                          </div>
                        )}
                      </div>
                      {day.activity ? (
                        <div className="text-emerald-600 text-sm dark:text-emerald-400">
                          {formatDuration(day.activity.duration)} •{' '}
                          {t('sessions', { count: day.activity.sessions })}
                        </div>
                      ) : (
                        <div className="text-gray-500 text-sm dark:text-gray-400">
                          {t('noActivityRecorded')}
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
  }, [
    currentMonth,
    dailyActivity,
    userTimezone,
    today,
    settings.timeReference,
    t,
  ]);

  // Optimized monthly data processing - single-pass algorithm with inline streak calculation
  const monthlyData = useMemo(() => {
    const acc: Record<
      string,
      {
        name: string;
        totalDuration: number;
        activeDays: number;
        totalSessions: number;
        dates: Array<{
          date: dayjs.Dayjs;
          activity: { duration: number; sessions: number };
        }>;
        weekdays: number;
        weekends: number;
        bestDay: { duration: number; date: string };
        longestStreak: number;
        currentStreak: number;
      }
    > = {};

    // Sort activities chronologically for accurate streak calculation
    const sortedActivity = [...(dailyActivity || [])].sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // Single pass: build monthly data + calculate streaks inline
    sortedActivity.forEach((activity, index) => {
      const date = dayjs.utc(activity.date).tz(userTimezone);
      const monthKey = date.format('YYYY-MM');
      const monthName = date.format('MMM YYYY');

      if (!acc[monthKey]) {
        acc[monthKey] = {
          name: monthName,
          totalDuration: 0,
          activeDays: 0,
          totalSessions: 0,
          dates: [],
          weekdays: 0,
          weekends: 0,
          bestDay: { duration: 0, date: '' },
          longestStreak: 0,
          currentStreak: 0,
        };
      }

      const monthData = acc[monthKey];
      monthData.totalDuration += activity.duration;
      monthData.totalSessions += activity.sessions;
      monthData.activeDays += 1;
      monthData.dates.push({ date, activity });

      // Track weekday vs weekend activity
      if (date.day() === 0 || date.day() === 6) {
        monthData.weekends += 1;
      } else {
        monthData.weekdays += 1;
      }

      // Track best day
      if (activity.duration > monthData.bestDay.duration) {
        monthData.bestDay = {
          duration: activity.duration,
          date: date.format('MMM D'),
        };
      }

      // Streak calculation (check if consecutive with previous activity in same month)
      if (index > 0) {
        const prevActivity = sortedActivity[index - 1];
        if (prevActivity) {
          const prevDate = dayjs.utc(prevActivity.date).tz(userTimezone);
          const prevMonthKey = prevDate.format('YYYY-MM');

          // Only calculate streak if previous activity is in the same month
          if (prevMonthKey === monthKey) {
            const daysDiff = date.diff(prevDate, 'day');
            if (daysDiff === 1 && activity.duration > 0) {
              // Consecutive day with activity
              monthData.currentStreak += 1;
              monthData.longestStreak = Math.max(
                monthData.longestStreak,
                monthData.currentStreak
              );
            } else if (daysDiff > 1 || activity.duration === 0) {
              // Gap in days or no activity - reset streak
              monthData.currentStreak = activity.duration > 0 ? 1 : 0;
            }
          } else {
            // New month - start fresh streak
            monthData.currentStreak = activity.duration > 0 ? 1 : 0;
            monthData.longestStreak = Math.max(
              monthData.longestStreak,
              monthData.currentStreak
            );
          }
        } else {
          // Previous activity missing - initialize streak
          monthData.currentStreak = activity.duration > 0 ? 1 : 0;
          monthData.longestStreak = Math.max(
            monthData.longestStreak,
            monthData.currentStreak
          );
        }
      } else {
        // First activity - initialize streak
        monthData.currentStreak = activity.duration > 0 ? 1 : 0;
        monthData.longestStreak = Math.max(
          monthData.longestStreak,
          monthData.currentStreak
        );
      }
    });

    return acc;
  }, [dailyActivity, userTimezone]);

  // Compute monthly stats directly from pre-processed monthlyData (streaks already calculated)
  const monthlyStats = useMemo(() => {
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
        const prevAvg =
          prevData.totalDuration / Math.max(prevData.activeDays, 1);

        if (prevAvg > 0) {
          if (currentAvg > prevAvg * 1.1) trend = 'up';
          else if (currentAvg < prevAvg * 0.9) trend = 'down';

          trendValue = ((currentAvg - prevAvg) / prevAvg) * 100;
        } else {
          trend = 'neutral';
          trendValue = 0;
        }
      }

      return { monthKey, data, trend, trendValue };
    });

    // Calculate overall statistics for summary card
    const totalOverallDuration = sortedMonths.reduce(
      (sum, [, data]) => sum + data.totalDuration,
      0
    );
    const totalOverallSessions = sortedMonths.reduce(
      (sum, [, data]) => sum + data.totalSessions,
      0
    );
    const totalActiveDays = sortedMonths.reduce(
      (sum, [, data]) => sum + data.activeDays,
      0
    );
    const avgDailyOverall =
      totalActiveDays > 0 ? totalOverallDuration / totalActiveDays : 0;
    const avgSessionLength =
      totalOverallSessions > 0
        ? totalOverallDuration / totalOverallSessions
        : 0;
    const overallFocusScore =
      avgSessionLength > 0
        ? Math.min(100, Math.round((avgSessionLength / 3600) * 25))
        : 0;

    return {
      sortedMonths,
      monthsWithTrends,
      overallStats: {
        totalDuration: totalOverallDuration,
        totalSessions: totalOverallSessions,
        activeDays: totalActiveDays,
        avgDaily: avgDailyOverall,
        avgSession: avgSessionLength,
        focusScore: overallFocusScore,
        monthCount: sortedMonths.length,
      },
    };
  }, [monthlyData]);

  // Card components
  const SummaryCard = ({ data }: { data: any }) => (
    <div className="group relative overflow-hidden rounded-lg border bg-linear-to-br from-blue-50 to-indigo-50 p-3 shadow-sm transition-all hover:shadow-md dark:border-blue-800/30 dark:from-blue-950/20 dark:to-indigo-950/20">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-blue-900 text-sm dark:text-blue-100">
            {t('cards.overall')}
          </h4>
          <span className="text-blue-600 text-xs dark:text-blue-300">
            {t('monthsCount', { count: data.monthCount })}
          </span>
        </div>
        <div className="rounded-full bg-blue-100 px-2 py-1 font-medium text-blue-700 text-xs dark:bg-blue-900/50 dark:text-blue-300">
          {data.focusScore}%
        </div>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-blue-600 dark:text-blue-400">
            {t('cards.total')}
          </div>
          <div className="font-medium text-blue-900 dark:text-blue-100">
            {formatDuration(data.totalDuration)}
          </div>
        </div>
        <div>
          <div className="text-blue-600 dark:text-blue-400">
            {t('cards.daily')}
          </div>
          <div className="font-medium text-blue-900 dark:text-blue-100">
            {formatDuration(Math.round(data.avgDaily))}
          </div>
        </div>
        <div>
          <div className="text-blue-600 dark:text-blue-400">
            {t('cards.sessions')}
          </div>
          <div className="font-medium text-blue-900 dark:text-blue-100">
            {data.totalSessions}
          </div>
        </div>
        <div>
          <div className="text-blue-600 dark:text-blue-400">
            {t('cards.days')}
          </div>
          <div className="font-medium text-blue-900 dark:text-blue-100">
            {data.activeDays}
          </div>
        </div>
      </div>
    </div>
  );

  const MonthlyCard = ({
    monthKey,
    data,
    trend,
    trendValue,
  }: {
    monthKey: string;
    data: any;
    trend: 'up' | 'down' | 'neutral';
    trendValue: number;
  }) => {
    const avgDailyDuration =
      data.activeDays > 0 ? data.totalDuration / data.activeDays : 0;

    return (
      <div className="group relative overflow-hidden rounded-lg border bg-linear-to-br from-green-50 to-emerald-50 p-3 shadow-sm transition-all hover:shadow-md dark:border-green-800/30 dark:from-green-950/20 dark:to-emerald-950/20">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-green-900 text-sm dark:text-green-100">
              {data.name}
            </h4>
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {trend !== 'neutral' && (
                <span
                  className={cn(
                    'font-medium text-xs',
                    trend === 'up'
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  )}
                >
                  {trend === 'up' ? '↗' : '↘'}
                  {Math.abs(trendValue).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-green-600 dark:text-green-400">
              {t('cards.total')}
            </div>
            <div className="font-medium text-green-900 dark:text-green-100">
              {formatDuration(data.totalDuration)}
            </div>
          </div>
          <div>
            <div className="text-green-600 dark:text-green-400">
              {t('cards.daily')}
            </div>
            <div className="font-medium text-green-900 dark:text-green-100">
              {formatDuration(Math.round(avgDailyDuration))}
            </div>
          </div>
          <div>
            <div className="text-green-600 dark:text-green-400">
              {t('cards.sessions')}
            </div>
            <div className="font-medium text-green-900 dark:text-green-100">
              {data.totalSessions}
            </div>
          </div>
          <div>
            <div className="text-green-600 dark:text-green-400">
              {t('cards.days')}
            </div>
            <div className="font-medium text-green-900 dark:text-green-100">
              {data.activeDays}
            </div>
          </div>
        </div>

        {/* Mini Heatmap */}
        <div className="mb-2">
          <div className="grid grid-cols-7 gap-px">
            {Array.from({ length: 7 * 4 }, (_, i) => {
              const monthStart = dayjs(monthKey + '-01');
              const dayOffset = i - monthStart.day();
              const currentDay = monthStart.add(dayOffset, 'day');

              const dayActivity = data.dates.find(
                (d: any) =>
                  d?.date?.format('YYYY-MM-DD') ===
                  currentDay.format('YYYY-MM-DD')
              );

              const isCurrentMonth = currentDay.month() === monthStart.month();
              const dayIntensity = dayActivity?.activity
                ? getIntensity(dayActivity.activity.duration)
                : 0;

              return (
                <div
                  key={i}
                  className={cn(
                    'aspect-square rounded-[1px] transition-all',
                    isCurrentMonth
                      ? dayActivity?.activity
                        ? getColorClass(dayIntensity)
                        : 'bg-green-100 dark:bg-green-900/30'
                      : 'bg-transparent'
                  )}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const UpcomingCard = ({ name }: { monthKey: string; name: string }) => (
    <div className="group relative overflow-hidden rounded-lg border border-muted/40 bg-linear-to-br from-muted/20 to-muted/10 p-3 opacity-60 backdrop-blur-sm transition-all hover:from-muted/30 hover:to-muted/20 hover:opacity-80">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-muted-foreground/80 text-sm">
            {name}
          </h4>
          <span className="text-muted-foreground/60 text-xs">
            {t('cards.nextMonth')}
          </span>
        </div>
        <div className="rounded-full bg-muted/50 px-2 py-1 font-medium text-muted-foreground/70 text-xs backdrop-blur-sm">
          {t('cards.plan')}
        </div>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2 text-xs opacity-50">
        <div>
          <div className="text-muted-foreground/60">{t('cards.target')}</div>
          <div className="font-medium text-muted-foreground/60">
            {t('cards.setGoal')}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground/60">{t('cards.focus')}</div>
          <div className="font-medium text-muted-foreground/60">
            {t('cards.stayConsistent')}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground/60">{t('cards.sessions')}</div>
          <div className="font-medium text-muted-foreground/60">
            {t('cards.planAhead')}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground/60">{t('cards.growth')}</div>
          <div className="font-medium text-muted-foreground/60">
            {t('cards.keepGoing')}
          </div>
        </div>
      </div>

      <div className="mb-2 opacity-30">
        <div className="grid grid-cols-7 gap-px">
          {Array.from({ length: 7 * 4 }, (_, i) => (
            <div key={i} className="aspect-square rounded-[1px] bg-muted/50" />
          ))}
        </div>
      </div>

      <div className="border-muted/30 border-t pt-2">
        <p className="text-muted-foreground/60 text-xs">
          {t('cards.keepMomentum')}
        </p>
      </div>
    </div>
  );

  const GettingStartedCard = () => (
    <div className="group relative overflow-hidden rounded-lg border bg-linear-to-br from-purple-50 to-violet-50 p-3 shadow-sm transition-all hover:shadow-md dark:border-purple-800/30 dark:from-purple-950/20 dark:to-violet-950/20">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-purple-900 text-sm dark:text-purple-100">
            {t('cards.getStarted')}
          </h4>
          <span className="text-purple-600 text-xs dark:text-purple-300">
            {t('cards.beginJourney')}
          </span>
        </div>
        <div className="rounded-full bg-purple-100 px-2 py-1 font-medium text-purple-700 text-xs dark:bg-purple-900/50 dark:text-purple-300">
          {t('cards.new')}
        </div>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-purple-500" />
          <span className="text-purple-700 dark:text-purple-300">
            {t('cards.startTimerSession')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-purple-500" />
          <span className="text-purple-700 dark:text-purple-300">
            {t('cards.buildDailyHabits')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-purple-500" />
          <span className="text-purple-700 dark:text-purple-300">
            {t('cards.trackProgress')}
          </span>
        </div>
      </div>

      <div className="mt-3 border-purple-200 border-t pt-2 dark:border-purple-800">
        <p className="text-purple-700 text-xs dark:text-purple-300">
          {t('cards.pomodoroTip')}
        </p>
      </div>
    </div>
  );

  const CompactCardsContainer = ({
    cards,
    currentIndex,
    setCurrentIndex,
    maxVisibleCards,
  }: {
    cards: any[];
    currentIndex: number;
    setCurrentIndex: (index: number) => void;
    maxVisibleCards: number;
  }) => {
    const totalCards = cards.length;
    const canScrollLeft = currentIndex > 0;
    const canScrollRight = currentIndex < totalCards - maxVisibleCards;

    const scrollLeft = () => {
      if (canScrollLeft) {
        setCurrentIndex(Math.max(0, currentIndex - 1));
      }
    };

    const scrollRight = () => {
      if (canScrollRight) {
        setCurrentIndex(
          Math.min(totalCards - maxVisibleCards, currentIndex + 1)
        );
      }
    };

    const visibleCards = cards.slice(
      currentIndex,
      currentIndex + maxVisibleCards
    );

    return (
      <div className="relative">
        {/* Navigation Arrows - Only show if needed */}
        {totalCards > maxVisibleCards && (
          <>
            <button
              type="button"
              onClick={scrollLeft}
              disabled={!canScrollLeft}
              className={cn(
                '-translate-y-1/2 absolute top-1/2 left-0 z-10 h-8 w-8 rounded-full border bg-background/80 shadow-md backdrop-blur-sm transition-all',
                canScrollLeft
                  ? 'border-border text-foreground hover:border-accent-foreground/20 hover:bg-accent'
                  : 'cursor-not-allowed border-muted text-muted-foreground opacity-50'
              )}
              aria-label={t('aria.previousCards')}
            >
              <ChevronLeft className="mx-auto h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={scrollRight}
              disabled={!canScrollRight}
              className={cn(
                '-translate-y-1/2 absolute top-1/2 right-0 z-10 h-8 w-8 rounded-full border bg-background/80 shadow-md backdrop-blur-sm transition-all',
                canScrollRight
                  ? 'border-border text-foreground hover:border-accent-foreground/20 hover:bg-accent'
                  : 'cursor-not-allowed border-muted text-muted-foreground opacity-50'
              )}
              aria-label={t('aria.nextCards')}
            >
              <ChevronRight className="mx-auto h-4 w-4" />
            </button>
          </>
        )}

        {/* Cards Container */}
        <div
          className={cn(
            'transition-all duration-300',
            totalCards > maxVisibleCards ? 'mx-8' : 'mx-0'
          )}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleCards.map((card) => {
              if (card.type === 'summary' && card.data) {
                return <SummaryCard key="summary" data={card.data} />;
              }

              if (card.type === 'monthly' && card.data) {
                return (
                  <MonthlyCard
                    key={card.monthKey}
                    monthKey={card.monthKey}
                    data={card.data}
                    trend={card.trend}
                    trendValue={card.trendValue}
                  />
                );
              }

              if (card.type === 'upcoming') {
                return (
                  <UpcomingCard
                    key={`upcoming-${card.monthKey}`}
                    monthKey={card.monthKey}
                    name={card.name}
                  />
                );
              }

              if (card.type === 'getting-started') {
                return <GettingStartedCard key="getting-started" />;
              }

              return null;
            })}
          </div>
        </div>

        {/* Pagination Dots - Only show if needed */}
        {totalCards > maxVisibleCards && (
          <div className="mt-3 flex justify-center gap-1">
            {Array.from(
              { length: Math.ceil(totalCards / maxVisibleCards) },
              (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrentIndex(i * maxVisibleCards)}
                  className={cn(
                    'h-2 w-2 rounded-full transition-all',
                    Math.floor(currentIndex / maxVisibleCards) === i
                      ? 'bg-primary'
                      : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                  )}
                  aria-label={t('aria.goToPage', { page: i + 1 })}
                />
              )
            )}
          </div>
        )}
      </div>
    );
  };

  // Build cards list from pre-computed monthlyStats
  const allCards = useMemo(() => {
    const { sortedMonths, monthsWithTrends, overallStats } = monthlyStats;
    const cards = [];

    // Determine if user is "established" enough to show upcoming month suggestions
    const isEstablishedUser =
      overallStats.activeDays >= 7 &&
      overallStats.totalSessions >= 10 &&
      sortedMonths.length >= 1;
    const hasRecentActivity =
      sortedMonths.length > 0 &&
      dayjs().diff(dayjs().startOf('month'), 'day') < 15;
    const shouldShowUpcoming = isEstablishedUser && hasRecentActivity;

    // Add summary card if we have meaningful data
    if (sortedMonths.length > 0 && overallStats.activeDays >= 3) {
      cards.push({
        type: 'summary',
        data: overallStats,
      });
    }

    // Add monthly data cards
    monthsWithTrends.forEach(({ monthKey, data, trend, trendValue }) => {
      cards.push({
        type: 'monthly',
        monthKey,
        data,
        trend,
        trendValue,
      });
    });

    // Only add upcoming months if user is established and we have space
    if (shouldShowUpcoming && cards.length < 4) {
      const currentMonth = dayjs();
      const nextMonth = currentMonth.add(1, 'month');

      cards.push({
        type: 'upcoming',
        monthKey: nextMonth.format('YYYY-MM'),
        name: nextMonth.format('MMM YYYY'),
        isSubtle: true,
      });
    }

    // Add getting started card if no meaningful data
    if (sortedMonths.length === 0 || overallStats.activeDays < 3) {
      cards.unshift({
        type: 'getting-started',
      });
    }

    return cards;
  }, [monthlyStats]);

  // CompactCardsView component - uses memoized allCards to prevent recreation
  function CompactCardsView() {
    const [currentIndex, setCurrentIndex] = useState(0);
    const maxVisibleCards = 4;

    return (
      <CompactCardsContainer
        cards={allCards}
        currentIndex={currentIndex}
        setCurrentIndex={setCurrentIndex}
        maxVisibleCards={maxVisibleCards}
      />
    );
  }

  return (
    <div className="relative space-y-4 overflow-visible sm:space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-dynamic-green to-dynamic-cyan shadow-lg">
            <Calendar className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-lg sm:text-xl dark:text-gray-100">
              {t('title')}
            </h3>
            <p className="text-gray-600 text-sm sm:text-base dark:text-gray-400">
              {totalDuration > 0
                ? t('trackedThisYear', {
                    duration: formatDuration(totalDuration),
                  })
                : t('startTracking')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View Mode Settings */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1 px-2">
                <Settings className="h-3 w-3" />
                <span className="text-xs">{t('view')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">
                {t('settings.displayMode')}
              </DropdownMenuLabel>
              <DropdownMenuItem
                className="text-xs hover:cursor-pointer"
                onClick={() =>
                  setInternalSettings((prev) => ({
                    ...prev,
                    viewMode: 'original',
                  }))
                }
              >
                <Grid3X3 className="mr-2 h-3 w-3" />
                {t('settings.originalGrid')}
                {settings.viewMode === 'original' && (
                  <span className="ml-auto">✓</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs hover:cursor-pointer"
                onClick={() =>
                  setInternalSettings((prev) => ({
                    ...prev,
                    viewMode: 'hybrid',
                  }))
                }
              >
                <Calendar className="mr-2 h-3 w-3" />
                {t('settings.hybridView')}
                {settings.viewMode === 'hybrid' && (
                  <span className="ml-auto">✓</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs hover:cursor-pointer"
                onClick={() =>
                  setInternalSettings((prev) => ({
                    ...prev,
                    viewMode: 'calendar-only',
                  }))
                }
              >
                <Calendar className="mr-2 h-3 w-3" />
                {t('settings.calendarOnly')}
                {settings.viewMode === 'calendar-only' && (
                  <span className="ml-auto">✓</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs hover:cursor-pointer"
                onClick={() =>
                  setInternalSettings((prev) => ({
                    ...prev,
                    viewMode: 'compact-cards',
                  }))
                }
              >
                <LayoutDashboard className="mr-2 h-3 w-3" />
                {t('settings.compactCards')}
                {settings.viewMode === 'compact-cards' && (
                  <span className="ml-auto">✓</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">
                {t('settings.options')}
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                className="text-xs hover:cursor-pointer"
                checked={settings.timeReference === 'smart'}
                onCheckedChange={(checked) =>
                  setInternalSettings((prev) => ({
                    ...prev,
                    timeReference: checked
                      ? 'smart'
                      : prev.timeReference === 'smart'
                        ? 'relative'
                        : prev.timeReference,
                  }))
                }
              >
                {t('settings.showSmartTimeReferences')}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                className="text-xs hover:cursor-pointer"
                checked={settings.showOnboardingTips}
                onCheckedChange={(checked) =>
                  setInternalSettings((prev) => ({
                    ...prev,
                    showOnboardingTips: checked,
                  }))
                }
              >
                {t('settings.showHelpfulTips')}
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Legend */}
          <div className="flex items-center gap-2 rounded-lg bg-white/80 px-3 py-2 text-gray-600 text-xs shadow-sm ring-1 ring-gray-200/50 sm:gap-3 dark:bg-gray-800/80 dark:text-gray-400 dark:ring-gray-700/50">
            <span className="hidden font-medium sm:inline">
              {t('legend.less')}
            </span>
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3, 4].map((intensity) => (
                <div
                  key={intensity}
                  className={cn(
                    'h-2.5 w-2.5 rounded-[2px] transition-transform hover:scale-125 sm:h-3 sm:w-3',
                    getColorClass(intensity)
                  )}
                  title={t('legend.levelIntensity', { level: intensity })}
                />
              ))}
            </div>
            <span className="hidden font-medium sm:inline">
              {t('legend.more')}
            </span>
          </div>
        </div>
      </div>

      {/* Smart Onboarding Tips */}
      {shouldShowOnboardingTips && (
        <div className="rounded-lg border border-blue-200/60 bg-blue-50/50 p-3 shadow-sm dark:border-blue-800/60 dark:bg-blue-950/30">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <div className="flex-1 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium text-blue-900 dark:text-blue-100">
                  💡{' '}
                  {settings.viewMode === 'original' &&
                    t('onboarding.originalTitle')}
                  {settings.viewMode === 'hybrid' &&
                    t('onboarding.hybridTitle')}
                  {settings.viewMode === 'calendar-only' &&
                    t('onboarding.calendarOnlyTitle')}
                  {settings.viewMode === 'compact-cards' &&
                    t('onboarding.compactCardsTitle')}
                </p>
                {onboardingState.viewCount > 0 && (
                  <span className="text-blue-600 text-xs opacity-75 dark:text-blue-400">
                    {t('onboarding.viewNumber', {
                      count: onboardingState.viewCount + 1,
                    })}
                  </span>
                )}
              </div>
              <p className="text-blue-700 leading-relaxed dark:text-blue-300">
                {settings.viewMode === 'original' &&
                  t('onboarding.originalDescription')}
                {settings.viewMode === 'hybrid' &&
                  t('onboarding.hybridDescription')}
                {settings.viewMode === 'calendar-only' &&
                  t('onboarding.calendarOnlyDescription')}
                {settings.viewMode === 'compact-cards' &&
                  t('onboarding.compactCardsDescription')}
              </p>
              {onboardingState.viewCount >= 3 && (
                <p className="text-blue-600 text-xs opacity-80 dark:text-blue-400">
                  {t('onboarding.tip')}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/50"
              onClick={handleDismissTips}
              title={t('onboarding.hideTooltip')}
              aria-label={t('onboarding.closeAria')}
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
                <div className="flex w-8 flex-col justify-between gap-0.5 font-medium text-gray-500 text-xs dark:text-gray-400">
                  <span className="leading-none">{t('days.monShort')}</span>
                  <span className="leading-none">{t('days.tueShort')}</span>
                  <span className="leading-none">{t('days.wedShort')}</span>
                  <span className="leading-none">{t('days.thuShort')}</span>
                  <span className="leading-none">{t('days.friShort')}</span>
                  <span className="leading-none">{t('days.satShort')}</span>
                  <span className="leading-none">{t('days.sunShort')}</span>
                </div>
                <div className="flex-1 overflow-visible">
                  {renderHeatmapSection(mobileFirstRow, 'mobile-first', true)}
                </div>
              </div>

              <div className="flex items-start gap-3 overflow-visible">
                <div className="flex w-8 flex-col justify-between gap-0.5 font-medium text-gray-500 text-xs dark:text-gray-400">
                  <span className="leading-none">{t('days.monShort')}</span>
                  <span className="leading-none">{t('days.tueShort')}</span>
                  <span className="leading-none">{t('days.wedShort')}</span>
                  <span className="leading-none">{t('days.thuShort')}</span>
                  <span className="leading-none">{t('days.friShort')}</span>
                  <span className="leading-none">{t('days.satShort')}</span>
                  <span className="leading-none">{t('days.sunShort')}</span>
                </div>
                <div className="flex-1 overflow-visible">
                  {renderHeatmapSection(mobileSecondRow, 'mobile-second', true)}
                </div>
              </div>

              {/* Third row for mobile */}
              <div className="flex items-start gap-3 overflow-visible">
                <div className="flex w-8 flex-col justify-between gap-0.5 font-medium text-gray-500 text-xs dark:text-gray-400">
                  <span className="leading-none">{t('days.monShort')}</span>
                  <span className="leading-none">{t('days.tueShort')}</span>
                  <span className="leading-none">{t('days.wedShort')}</span>
                  <span className="leading-none">{t('days.thuShort')}</span>
                  <span className="leading-none">{t('days.friShort')}</span>
                  <span className="leading-none">{t('days.satShort')}</span>
                  <span className="leading-none">{t('days.sunShort')}</span>
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
                <div className="flex flex-col justify-between font-semibold text-gray-500 text-sm dark:text-gray-400">
                  <span className="leading-none">{t('days.mon')}</span>
                  <span className="leading-none">{t('days.wed')}</span>
                  <span className="leading-none">{t('days.fri')}</span>
                </div>
                <div className="flex-1 overflow-visible">
                  {renderHeatmapSection(
                    desktopFirstRow,
                    'desktop-first',
                    false
                  )}
                </div>
              </div>

              {/* Row 2: Last 6 months */}
              <div className="flex gap-4 overflow-visible">
                <div className="flex flex-col justify-between font-semibold text-gray-500 text-sm dark:text-gray-400">
                  <span className="leading-none">{t('days.mon')}</span>
                  <span className="leading-none">{t('days.wed')}</span>
                  <span className="leading-none">{t('days.fri')}</span>
                </div>
                <div className="flex-1 overflow-visible">
                  {renderHeatmapSection(
                    desktopSecondRow,
                    'desktop-second',
                    false
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {settings.viewMode === 'hybrid' && (
        <div className="space-y-4">
          {/* Year Overview */}
          <div className="rounded-lg border bg-gray-50/50 p-3 dark:border-gray-700/60 dark:bg-gray-800/30">
            {renderYearOverview()}
          </div>

          {/* Monthly Calendar */}
          <div className="rounded-lg border bg-white/50 p-3 dark:border-gray-700/60 dark:bg-gray-900/30">
            {renderMonthlyCalendar()}
          </div>
        </div>
      )}

      {settings.viewMode === 'calendar-only' && (
        <div className="rounded-lg border bg-white/50 p-3 dark:border-gray-700/60 dark:bg-gray-900/30">
          {renderMonthlyCalendar()}
        </div>
      )}

      {settings.viewMode === 'compact-cards' && <CompactCardsView />}
    </div>
  );
}
