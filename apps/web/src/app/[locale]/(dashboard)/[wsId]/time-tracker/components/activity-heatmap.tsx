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

  return (
    <div className="space-y-4 rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900/50">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Activity
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {totalDuration > 0
              ? `${formatDuration(totalDuration)} tracked this year`
              : 'No activity tracked this year'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Less</span>
          <div className="flex items-center gap-1">
            {[0, 1, 2, 3, 4].map((intensity) => (
              <div
                key={intensity}
                className={cn(
                  'h-2.5 w-2.5 rounded-sm',
                  getColorClass(intensity)
                )}
              />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>

      {/* Heatmap */}
      <div className="flex gap-4">
        <div className="flex flex-col justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Mon</span>
          <span>Wed</span>
          <span>Fri</span>
        </div>
        <div className="w-full">
          {/* Month Labels */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
            }}
          >
            {monthLabels.map(({ label, weekIndex }) => (
              <div
                key={`${label}-${weekIndex}`}
                className="text-xs text-gray-500"
                style={{ gridColumnStart: weekIndex + 1 }}
              >
                {label}
              </div>
            ))}
          </div>
          {/* Grid */}
          <div
            className="grid grid-flow-col grid-rows-7 gap-1"
            style={{
              gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
            }}
          >
            {weeks.flat().map((day, index) => {
              if (!day) {
                return (
                  <div
                    key={index}
                    className="aspect-square rounded-sm bg-gray-50 dark:bg-gray-900"
                  />
                );
              }

              const intensity = getIntensity(day.activity?.duration || 0);
              const isToday = day.date.isSame(today, 'day');

              return (
                <Tooltip key={index}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        'aspect-square cursor-pointer rounded-sm transition-colors hover:ring-1 hover:ring-gray-400',
                        getColorClass(intensity),
                        isToday &&
                          'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-900'
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <div className="space-y-1">
                      <div className="font-medium">
                        {day.date.format('dddd, MMMM D, YYYY')}
                      </div>
                      {day.activity ? (
                        <div className="space-y-0.5 text-xs">
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                              {formatDuration(day.activity.duration)}
                            </span>
                            <span className="text-muted-foreground">
                              tracked
                            </span>
                          </div>
                          {day.activity.sessions > 0 && (
                            <div className="text-muted-foreground">
                              {day.activity.sessions} session
                              {day.activity.sessions > 1 ? 's' : ''}
                            </div>
                          )}
                          <div className="text-muted-foreground">
                            Level {intensity} intensity
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          No activity recorded
                        </div>
                      )}
                      {isToday && (
                        <div className="flex items-center gap-1 text-xs">
                          <div className="h-2 w-2 rounded-full bg-blue-500" />
                          <span className="font-medium text-blue-600 dark:text-blue-400">
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
      </div>
    </div>
  );
}
