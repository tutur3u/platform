'use client';

import dayjs from 'dayjs';
import { useMemo } from 'react';
import type {
  ActivityDay,
  CompactHeatmapCard,
  MonthlyAggregate,
} from '../types';

export function useActivityAnalytics(
  dailyActivity: ActivityDay[],
  userTimezone: string
) {
  const heatmapData = useMemo(() => {
    const dataObj: Record<string, number> = {};

    dailyActivity.forEach((activity) => {
      const activityDate = dayjs.utc(activity.date).tz(userTimezone);
      dataObj[activityDate.format('YYYY-MM-DD')] = activity.duration;
    });

    return dataObj;
  }, [dailyActivity, userTimezone]);

  const activityMap = useMemo(() => {
    const map = new Map<string, { duration: number; sessions: number }>();

    dailyActivity.forEach((activity) => {
      const activityDate = dayjs.utc(activity.date).tz(userTimezone);
      map.set(activityDate.format('YYYY-MM-DD'), activity);
    });

    return map;
  }, [dailyActivity, userTimezone]);

  const totalDuration = useMemo(
    () => dailyActivity.reduce((sum, day) => sum + day.duration, 0),
    [dailyActivity]
  );

  const monthlyData = useMemo(() => {
    const acc: Record<string, MonthlyAggregate> = {};
    const sortedActivity = [...dailyActivity].sort((a, b) =>
      a.date.localeCompare(b.date)
    );

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

      const monthData = acc[monthKey]!;
      monthData.totalDuration += activity.duration;
      monthData.totalSessions += activity.sessions;
      monthData.activeDays += 1;
      monthData.dates.push({ date, activity });

      if (date.day() === 0 || date.day() === 6) {
        monthData.weekends += 1;
      } else {
        monthData.weekdays += 1;
      }

      if (activity.duration > monthData.bestDay.duration) {
        monthData.bestDay = {
          duration: activity.duration,
          date: date.format('MMM D'),
        };
      }

      if (index > 0) {
        const prevActivity = sortedActivity[index - 1];
        if (prevActivity) {
          const prevDate = dayjs.utc(prevActivity.date).tz(userTimezone);
          const prevMonthKey = prevDate.format('YYYY-MM');

          if (prevMonthKey === monthKey) {
            const daysDiff = date.diff(prevDate, 'day');
            if (daysDiff === 1 && activity.duration > 0) {
              monthData.currentStreak += 1;
              monthData.longestStreak = Math.max(
                monthData.longestStreak,
                monthData.currentStreak
              );
            } else if (daysDiff > 1 || activity.duration === 0) {
              monthData.currentStreak = activity.duration > 0 ? 1 : 0;
            }
          } else {
            monthData.currentStreak = activity.duration > 0 ? 1 : 0;
            monthData.longestStreak = Math.max(
              monthData.longestStreak,
              monthData.currentStreak
            );
          }
        }
      } else {
        monthData.currentStreak = activity.duration > 0 ? 1 : 0;
        monthData.longestStreak = Math.max(
          monthData.longestStreak,
          monthData.currentStreak
        );
      }
    });

    return acc;
  }, [dailyActivity, userTimezone]);

  const monthlyStats = useMemo(() => {
    const sortedMonths = Object.entries(monthlyData)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 12);

    const monthsWithTrends = sortedMonths.map(([monthKey, data], index) => {
      const previousMonth = sortedMonths[index + 1];
      let trend: 'up' | 'down' | 'neutral' = 'neutral';
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
        }
      }

      return { monthKey, data, trend, trendValue };
    });

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

  const allCards = useMemo<CompactHeatmapCard[]>(() => {
    const { sortedMonths, monthsWithTrends, overallStats } = monthlyStats;
    const cards: CompactHeatmapCard[] = [];

    const isEstablishedUser =
      overallStats.activeDays >= 7 &&
      overallStats.totalSessions >= 10 &&
      sortedMonths.length >= 1;
    const hasRecentActivity =
      sortedMonths.length > 0 &&
      dayjs().diff(dayjs().startOf('month'), 'day') < 15;
    const shouldShowUpcoming = isEstablishedUser && hasRecentActivity;

    if (sortedMonths.length > 0 && overallStats.activeDays >= 3) {
      cards.push({ type: 'summary', data: overallStats });
    }

    monthsWithTrends.forEach(({ monthKey, data, trend, trendValue }) => {
      cards.push({ type: 'monthly', monthKey, data, trend, trendValue });
    });

    if (shouldShowUpcoming && cards.length < 4) {
      const nextMonth = dayjs().add(1, 'month');
      cards.push({
        type: 'upcoming',
        monthKey: nextMonth.format('YYYY-MM'),
        name: nextMonth.format('MMM YYYY'),
        isSubtle: true,
      });
    }

    if (sortedMonths.length === 0 || overallStats.activeDays < 3) {
      cards.unshift({ type: 'getting-started' });
    }

    return cards;
  }, [monthlyStats]);

  return {
    heatmapData,
    activityMap,
    totalDuration,
    allCards,
  };
}
