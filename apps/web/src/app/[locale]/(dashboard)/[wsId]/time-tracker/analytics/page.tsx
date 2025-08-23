'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { ChartArea, Clock, TrendingUp, Users } from '@tuturuuu/ui/icons';
import dayjs from 'dayjs';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { LineChart, PieChart } from '@/components/ui/charts';
import { ActivityHeatmap } from '../components/activity-heatmap';

// Helper function to format duration
const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

// Helper function to format percentage
const formatPercentage = (value: number): string => {
  return `${Math.round(value)}%`;
};

export default function TimeTrackerAnalyticsPage() {
  const params = useParams();
  const wsId = params.wsId as string;
  const [period] = useState<'week' | 'month'>('week');

  // Fetch real analytics data
  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['time-tracking-analytics', wsId, period],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/analytics?period=${period}`
      );
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    },
    refetchInterval: 300000, // 5 minutes
  });

  // Fetch additional stats
  const { data: statsData } = useQuery({
    queryKey: ['time-tracking-stats', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=stats`
      );
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
  });

  // Prepare chart data from real data
  const timeDistributionData =
    analyticsData?.analytics?.categoryBreakdown?.map((cat: any) => ({
      name: cat.name,
      value: cat.time,
      color: cat.color,
    })) || [];

  const weeklyTrendsData =
    analyticsData?.analytics?.weeklyData?.map((week: any) => ({
      week: week.weekStart,
      hours: week.totalHours,
    })) || [];

  // Calculate real metrics from API data
  const totalTime = statsData?.stats?.monthTime || 0;
  const totalTimeFormatted = formatDuration(totalTime);

  // Use real percentage change from API
  const timeChange = analyticsData?.analytics?.timeChange || 0;
  const lastMonthChange =
    timeChange > 0 ? `+${timeChange.toFixed(1)}%` : `${timeChange.toFixed(1)}%`;

  const activeProjects = analyticsData?.analytics?.activeProjects?.length || 0;
  const newThisWeek = analyticsData?.analytics?.newProjects?.length || 0;

  const teamMembers = analyticsData?.analytics?.teamMembers || 0;
  const allActiveThisMonth =
    teamMembers > 0 ? `${teamMembers} active members` : 'No team members';

  const productivityScore = analyticsData?.analytics?.productivityScore || 0;
  const lastWeekChange =
    timeChange > 0 ? `+${timeChange.toFixed(1)}%` : `${timeChange.toFixed(1)}%`;

  // Client-side rendering to prevent hydration issues
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Transform heatmap data for your existing component
  const dailyActivity = useMemo(() => {
    const heatmapData = analyticsData?.analytics?.heatmapData || [];
    const dailyMap = new Map<string, { duration: number; sessions: number }>();

    // Aggregate hourly data into daily totals
    heatmapData.forEach((hourData: any) => {
      const date = dayjs()
        .subtract(
          ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
            hourData.day
          ),
          'day'
        )
        .format('YYYY-MM-DD');

      const existing = dailyMap.get(date) || { duration: 0, sessions: 0 };
      dailyMap.set(date, {
        duration: existing.duration + hourData.time,
        sessions: existing.sessions + (hourData.time > 0 ? 1 : 0),
      });
    });

    return Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      duration: data.duration,
      sessions: data.sessions,
    }));
  }, [analyticsData]);

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="mb-6 flex items-center gap-2">
        <ChartArea className="h-6 w-6 text-primary" />
        <h1 className="font-bold text-2xl">Time Tracker Analytics</h1>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Total Time Tracked
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{totalTimeFormatted}</div>
            <p className="text-muted-foreground text-xs">
              {lastMonthChange} from last {period}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Active Projects
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{activeProjects}</div>
            <p className="text-muted-foreground text-xs">
              {newThisWeek > 0
                ? `+${newThisWeek} new this week`
                : 'No new projects'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Team Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{teamMembers}</div>
            <p className="text-muted-foreground text-xs">
              {allActiveThisMonth}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Productivity Score
            </CardTitle>
            <ChartArea className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {formatPercentage(productivityScore)}
            </div>
            <p className="text-muted-foreground text-xs">
              {lastWeekChange} from last {period}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Detailed Analytics */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Time Distribution by Category</CardTitle>
            <CardDescription>
              How time is allocated across different categories
            </CardDescription>
          </CardHeader>
          <CardContent>
            {timeDistributionData.length > 0 ? (
              <div className="h-64">
                <PieChart
                  data={timeDistributionData}
                  colors={timeDistributionData.map(
                    (cat: any) => cat.color || '#3b82f6'
                  )}
                />
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                {isLoading ? 'Loading...' : 'No data available'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly Time Trends</CardTitle>
            <CardDescription>
              Time tracking patterns over the last 4 weeks
            </CardDescription>
          </CardHeader>
          <CardContent>
            {weeklyTrendsData.length > 0 ? (
              <div className="h-64">
                <LineChart
                  data={weeklyTrendsData}
                  xKey="week"
                  series={[{ key: 'hours', name: 'Hours' }]}
                  colors={['#3b82f6']}
                />
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                {isLoading ? 'Loading...' : 'No data available'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Heatmap */}
      {isClient ? (
        <ActivityHeatmap
          dailyActivity={dailyActivity}
          formatDuration={formatDuration}
        />
      ) : (
        <div className="animate-pulse rounded-lg border p-4">
          <div className="mb-4 h-8 w-48 rounded bg-gray-200"></div>
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-gray-200"></div>
            <div className="h-4 w-3/4 rounded bg-gray-200"></div>
            <div className="h-4 w-1/2 rounded bg-gray-200"></div>
          </div>
        </div>
      )}

      {/* Additional Analytics Sections */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Insights</CardTitle>
          <CardDescription>Key metrics and recommendations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border p-4 text-center">
              <div className="font-semibold text-green-600 text-lg">
                Total Sessions
              </div>
              <div className="font-bold text-2xl">
                {analyticsData?.analytics?.overview?.totalSessions || 0}
              </div>
              <div className="text-muted-foreground text-sm">This {period}</div>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <div className="font-semibold text-blue-600 text-lg">
                Avg Session Length
              </div>
              <div className="font-bold text-2xl">
                {formatDuration(
                  analyticsData?.analytics?.overview?.avgSessionLength || 0
                )}
              </div>
              <div className="text-muted-foreground text-sm">Per session</div>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <div className="font-semibold text-lg text-orange-600">
                Categories Used
              </div>
              <div className="font-bold text-2xl">
                {analyticsData?.analytics?.categoryBreakdown?.length || 0}
              </div>
              <div className="text-muted-foreground text-sm">
                Different categories
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
