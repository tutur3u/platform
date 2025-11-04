'use client';

import { Calendar, Clock, TrendingUp, Zap } from '@tuturuuu/icons';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { useMemo } from 'react';
import type { TimerStats } from '../types';

interface StatsOverviewProps {
  timerStats: TimerStats;
  formatDuration: (seconds: number) => string;
}

export function StatsOverview({
  timerStats,
  formatDuration,
}: StatsOverviewProps) {
  // Get current week dates for better UX
  const getWeekRange = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0, Sunday = 6
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - daysToSubtract);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    return {
      start: startOfWeek.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      end: endOfWeek.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
    };
  };

  const weekRange = getWeekRange();

  // Memoized stats cards with enhanced information
  const statsCards = useMemo(() => {
    const today = new Date();
    const isWeekend = today.getDay() === 0 || today.getDay() === 6;

    // Calculate week progress (Monday=1, Sunday=7)
    const dayOfWeek = today.getDay();
    const weekProgress = dayOfWeek === 0 ? 7 : dayOfWeek; // Sunday becomes 7
    const weekProgressPercentage = (weekProgress / 7) * 100;

    return [
      {
        icon: Calendar,
        label: 'Today',
        subtitle: today.toLocaleDateString('en-US', { weekday: 'long' }),
        value: formatDuration(timerStats.todayTime),
        color: 'text-blue-500',
        bg: 'from-blue-50 to-blue-100 dark:from-blue-950/20 dark:to-blue-900/20 border-dynamic-blue/30',
        icon2: isWeekend ? '🏖️' : '💼',
      },
      {
        icon: TrendingUp,
        label: 'This Week',
        subtitle: `${weekRange.start} - ${weekRange.end}`,
        value: formatDuration(timerStats.weekTime),
        color: 'text-green-500',
        bg: 'from-green-50 to-green-100 dark:from-green-950/20 dark:to-green-900/20 border-dynamic-green/30',
        icon2: '📊',
        progress: weekProgressPercentage,
        progressLabel: `Day ${weekProgress} of 7`,
      },
      {
        icon: Zap,
        label: 'This Month',
        subtitle: today.toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
        }),
        value: formatDuration(timerStats.monthTime),
        color: 'text-purple-500',
        bg: 'from-purple-50 to-purple-100 dark:from-purple-950/20 dark:to-purple-900/20 border-dynamic-purple/30',
        icon2: '🚀',
      },
      {
        icon: Clock,
        label: 'Streak',
        subtitle: timerStats.streak > 0 ? 'consecutive days' : 'start today!',
        value: `${timerStats.streak} days`,
        color: 'text-orange-500',
        bg: 'from-orange-50 to-orange-100 dark:from-orange-950/20 dark:to-orange-900/20 border-dynamic-orange/30',
        icon2: timerStats.streak >= 7 ? '🏆' : '⭐',
      },
    ];
  }, [timerStats, formatDuration, weekRange]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
      {statsCards.map((stat, index) => (
        <Card
          key={stat.label}
          className={cn(
            'group bg-linear-to-br transition-all duration-300',
            stat.bg,
            'slide-in-from-bottom animate-in duration-500'
          )}
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-start gap-2 sm:gap-4">
              <div className="shrink-0">
                <div
                  className={cn(
                    'rounded-full bg-white p-2 shadow-sm transition-transform sm:p-3 dark:bg-gray-800'
                  )}
                >
                  <stat.icon
                    className={cn('h-4 w-4 sm:h-6 sm:w-6', stat.color)}
                  />
                </div>
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-muted-foreground text-xs sm:text-sm">
                    {stat.label}
                  </p>
                  <span className="text-sm">{stat.icon2}</span>
                </div>
                <p
                  className="mb-1 truncate text-muted-foreground/80 text-xs sm:text-sm"
                  title={stat.subtitle}
                >
                  {stat.subtitle}
                </p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p
                      className="group truncate font-bold text-lg transition-all sm:text-2xl"
                      title={stat.value}
                    >
                      {stat.value}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
