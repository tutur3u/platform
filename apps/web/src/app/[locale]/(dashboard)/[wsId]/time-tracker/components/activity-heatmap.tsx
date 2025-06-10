'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

interface ActivityHeatmapProps {
  dailyActivity: Array<{
    date: string;
    duration: number;
    sessions: number;
  }>;
  // eslint-disable-next-line no-unused-vars
  formatDuration: (seconds: number) => string;
}

export function ActivityHeatmap({
  dailyActivity,
  formatDuration,
}: ActivityHeatmapProps) {
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
      <div className={cn('space-y-1.5', isMobile ? 'space-y-1' : 'space-y-2')}>
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
        {/* Grid */}
        <div
          className="grid grid-flow-col grid-rows-7"
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
                    'aspect-square rounded-[2px] bg-gray-100/80 dark:bg-gray-800/60',
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
                      'aspect-square rounded-[2px] transition-all duration-200 ease-out hover:shadow-sm focus:ring-2 focus:ring-emerald-400/50 focus:ring-offset-1 focus:outline-none',
                      isMobile
                        ? 'min-h-[11px] min-w-[11px] hover:scale-[1.15]'
                        : 'min-h-[13px] min-w-[13px] hover:scale-110 sm:min-h-[15px] sm:min-w-[15px] sm:hover:scale-105',
                      getColorClass(intensity),
                      'hover:ring-2 hover:ring-emerald-400/60 hover:ring-offset-1 dark:hover:ring-emerald-500/50 dark:hover:ring-offset-gray-900',
                      isToday &&
                        'shadow-md ring-2 ring-blue-500/80 ring-offset-2 dark:ring-blue-400/70 dark:ring-offset-gray-900'
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
                  className="pointer-events-none max-w-sm border-0 bg-white/96 p-3 shadow-xl backdrop-blur-md dark:bg-gray-900/96"
                  sideOffset={8}
                >
                  <div className="space-y-2.5">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">
                      {day.date.format('dddd, MMMM D, YYYY')}
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

  return (
    <div className="space-y-4 rounded-xl border border-gray-200/60 bg-gradient-to-br from-white to-gray-50/30 p-4 shadow-sm sm:space-y-5 sm:p-6 dark:border-gray-800/60 dark:from-gray-900/80 dark:to-gray-900/40">
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
        <div className="flex items-center gap-2 rounded-lg bg-white/60 px-3 py-2 text-xs text-gray-600 shadow-sm sm:gap-3 dark:bg-gray-800/60 dark:text-gray-400">
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

      {/* Mobile: Three-row layout */}
      <div className="block lg:hidden">
        <div className="space-y-6">
          {/* Day labels for mobile */}
          <div className="flex items-center gap-3">
            <div className="flex w-8 flex-col justify-between gap-[2px] text-xs font-medium text-gray-500 dark:text-gray-400">
              <span className="leading-none">M</span>
              <span className="leading-none">T</span>
              <span className="leading-none">W</span>
              <span className="leading-none">T</span>
              <span className="leading-none">F</span>
              <span className="leading-none">S</span>
              <span className="leading-none">S</span>
            </div>
            <div className="flex-1">
              {renderHeatmapSection(mobileFirstRow, 'mobile-first', true)}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex w-8 flex-col justify-between gap-[2px] text-xs font-medium text-gray-500 dark:text-gray-400">
              <span className="leading-none">M</span>
              <span className="leading-none">T</span>
              <span className="leading-none">W</span>
              <span className="leading-none">T</span>
              <span className="leading-none">F</span>
              <span className="leading-none">S</span>
              <span className="leading-none">S</span>
            </div>
            <div className="flex-1">
              {renderHeatmapSection(mobileSecondRow, 'mobile-second', true)}
            </div>
          </div>

          {/* Third row for mobile */}
          <div className="flex items-center gap-3">
            <div className="flex w-8 flex-col justify-between gap-[2px] text-xs font-medium text-gray-500 dark:text-gray-400">
              <span className="leading-none">M</span>
              <span className="leading-none">T</span>
              <span className="leading-none">W</span>
              <span className="leading-none">T</span>
              <span className="leading-none">F</span>
              <span className="leading-none">S</span>
              <span className="leading-none">S</span>
            </div>
            <div className="flex-1">
              {renderHeatmapSection(mobileThirdRow, 'mobile-third', true)}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop: Two-row layout */}
      <div className="hidden lg:block">
        <div className="space-y-6">
          {/* Row 1: First 6 months */}
          <div className="flex gap-4">
            <div className="flex flex-col justify-between text-sm font-semibold text-gray-500 dark:text-gray-400">
              <span className="leading-none">Mon</span>
              <span className="leading-none">Wed</span>
              <span className="leading-none">Fri</span>
            </div>
            <div className="flex-1">
              {renderHeatmapSection(desktopFirstRow, 'desktop-first', false)}
            </div>
          </div>

          {/* Row 2: Last 6 months */}
          <div className="flex gap-4">
            <div className="flex flex-col justify-between text-sm font-semibold text-gray-500 dark:text-gray-400">
              <span className="leading-none">Mon</span>
              <span className="leading-none">Wed</span>
              <span className="leading-none">Fri</span>
            </div>
            <div className="flex-1">
              {renderHeatmapSection(desktopSecondRow, 'desktop-second', false)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
