'use client';

import { Card, CardContent } from '@tuturuuu/ui/card';
import { Calendar, Clock, Settings, TrendingUp, Zap } from '@tuturuuu/ui/icons';
import { useMemo } from 'react';

interface YearSummaryStatsProps {
  dailyActivity: Array<{
    date: string;
    duration: number;
    sessions: number;
  }>;
  // eslint-disable-next-line no-unused-vars
  formatDuration: (seconds: number) => string;
}

export function YearSummaryStats({
  dailyActivity,
  formatDuration,
}: YearSummaryStatsProps) {
  // Helper function to calculate longest streak
  const calculateLongestStreak = (
    dailyActivity: Array<{ date: string; duration: number; sessions: number }>
  ) => {
    if (!dailyActivity.length) return 0;

    const sortedDays = dailyActivity
      .filter((day) => day.duration > 0)
      .map((day) => new Date(day.date))
      .sort((a, b) => a.getTime() - b.getTime());

    let maxStreak = 0;
    let currentStreak = 1;

    for (let i = 1; i < sortedDays.length; i++) {
      const prevDay = sortedDays[i - 1];
      const currentDay = sortedDays[i];
      if (!prevDay || !currentDay) continue;

      const diffInDays =
        (currentDay.getTime() - prevDay.getTime()) / (1000 * 60 * 60 * 24);

      if (diffInDays === 1) {
        currentStreak++;
      } else {
        maxStreak = Math.max(maxStreak, currentStreak);
        currentStreak = 1;
      }
    }

    return Math.max(maxStreak, currentStreak);
  };

  // Helper function to find most productive day
  const findMostProductiveDay = (
    dailyActivity: Array<{ date: string; duration: number; sessions: number }>
  ) => {
    if (!dailyActivity.length) return null;

    return dailyActivity.reduce((max, day) =>
      day.duration > max.duration ? day : max
    );
  };

  // Calculate additional stats for enhanced UX
  const additionalStats = useMemo(() => {
    const totalYearTime = dailyActivity.reduce(
      (sum, day) => sum + day.duration,
      0
    );
    const activeDays = dailyActivity.filter((day) => day.duration > 0).length;
    const avgDailyTime = activeDays > 0 ? totalYearTime / activeDays : 0;
    const longestStreak = calculateLongestStreak(dailyActivity);
    const mostProductiveDay = findMostProductiveDay(dailyActivity);

    return {
      totalYearTime,
      activeDays,
      avgDailyTime,
      longestStreak,
      mostProductiveDay,
    };
  }, [dailyActivity]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
      <Card className="border-0 bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/20 dark:to-amber-900/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-white p-2 shadow-sm dark:bg-gray-800">
              <Calendar className="h-4 w-4 text-amber-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">
                Total This Year
              </p>
              <p
                className="truncate text-lg font-bold"
                title={formatDuration(additionalStats.totalYearTime)}
              >
                {formatDuration(additionalStats.totalYearTime)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/20 dark:to-emerald-900/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-white p-2 shadow-sm dark:bg-gray-800">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">
                Active Days
              </p>
              <p className="truncate text-lg font-bold">
                {additionalStats.activeDays}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950/20 dark:to-violet-900/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-white p-2 shadow-sm dark:bg-gray-800">
              <Clock className="h-4 w-4 text-violet-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">
                Daily Average
              </p>
              <p
                className="truncate text-lg font-bold"
                title={formatDuration(additionalStats.avgDailyTime)}
              >
                {formatDuration(additionalStats.avgDailyTime)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-950/20 dark:to-rose-900/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-white p-2 shadow-sm dark:bg-gray-800">
              <Zap className="h-4 w-4 text-rose-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">
                Longest Streak
              </p>
              <p className="truncate text-lg font-bold">
                {additionalStats.longestStreak} days
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="col-span-2 border-0 bg-gradient-to-br from-indigo-50 to-indigo-100 sm:col-span-4 lg:col-span-1 dark:from-indigo-950/20 dark:to-indigo-900/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-white p-2 shadow-sm dark:bg-gray-800">
              <Settings className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">
                Most Productive
              </p>
              <p
                className="truncate text-sm font-bold"
                title={additionalStats.mostProductiveDay?.date}
              >
                {additionalStats.mostProductiveDay
                  ? new Date(
                      additionalStats.mostProductiveDay.date
                    ).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'N/A'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
