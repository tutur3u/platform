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
import { Settings, Calendar, Grid3X3, Info, ChevronLeft, ChevronRight } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import relativeTime from 'dayjs/plugin/relativeTime';
import isBetween from 'dayjs/plugin/isBetween';
import { useState } from 'react';

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

type HeatmapViewMode = 'original' | 'hybrid' | 'calendar-only';

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

  // Use external settings if provided, otherwise use internal settings
  const settings = externalSettings || internalSettings;
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
                      {settings.showTimeReference === 'both' && (
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

      {/* Onboarding Tips */}
      {settings.showOnboardingTips && (
        <div className="rounded-lg border border-blue-200/60 bg-blue-50/50 p-3 dark:border-blue-800/60 dark:bg-blue-950/30">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div className="space-y-1 text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                💡 Heatmap Guide
              </p>
              <p className="text-blue-700 dark:text-blue-300">
                {settings.viewMode === 'original' && "Darker colors = more activity. Use the View menu to try different layouts!"}
                {settings.viewMode === 'hybrid' && "Click on any month bar above to view that month's calendar below."}
                {settings.viewMode === 'calendar-only' && "Navigate between months using the arrow buttons. Each day shows your activity level."}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-blue-600 hover:text-blue-700 dark:text-blue-400"
              onClick={() => !externalSettings && setInternalSettings(prev => ({ ...prev, showOnboardingTips: false }))}
              disabled={!!externalSettings}
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
    </div>
  );
}
