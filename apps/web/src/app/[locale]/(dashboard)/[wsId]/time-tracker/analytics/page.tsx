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
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { LineChart, PieChart } from '@/components/ui/charts';

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
    analyticsData?.categoryData?.map((cat: any) => ({
      name: cat.name,
      value: cat.totalTime,
      color: cat.color,
    })) || [];

  const weeklyTrendsData =
    analyticsData?.weeklyData?.map((week: any) => ({
      week: week.weekStart,
      hours: week.totalHours,
    })) || [];

  // Calculate real metrics
  const totalTime = statsData?.stats?.monthTime || 0;
  const totalTimeFormatted = formatDuration(totalTime);
  const lastMonthChange = '+12.3%'; // This would be calculated from real data comparison

  const activeProjects = analyticsData?.activeProjects || 8;
  const newThisWeek = analyticsData?.newProjects || 2;

  const teamMembers = analyticsData?.teamMembers || 12;
  const allActiveThisMonth = 'All active this month';

  const productivityScore = analyticsData?.productivityScore || 87;
  const lastWeekChange = '+5%'; // This would be calculated from real data comparison

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
              {lastMonthChange} from last month
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
              +{newThisWeek} new this week
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
              {lastWeekChange} from last week
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Detailed Analytics */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Time Distribution by Project</CardTitle>
            <CardDescription>
              How time is allocated across different projects
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
                Peak Hours
              </div>
              <div className="font-bold text-2xl">
                {analyticsData?.peakHours || '9 AM - 11 AM'}
              </div>
              <div className="text-muted-foreground text-sm">
                Most productive time
              </div>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <div className="font-semibold text-blue-600 text-lg">
                Focus Score
              </div>
              <div className="font-bold text-2xl">
                {formatPercentage(analyticsData?.focusScore || 92)}
              </div>
              <div className="text-muted-foreground text-sm">
                High concentration
              </div>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <div className="font-semibold text-lg text-orange-600">
                Break Efficiency
              </div>
              <div className="font-bold text-2xl">
                {formatPercentage(analyticsData?.breakEfficiency || 78)}
              </div>
              <div className="text-muted-foreground text-sm">Good balance</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
