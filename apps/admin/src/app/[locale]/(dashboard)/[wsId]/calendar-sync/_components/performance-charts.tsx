'use client';

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import type { SyncLog } from '@tuturuuu/ui/legacy/calendar/settings/types';
import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';

interface Props {
  data: SyncLog[];
  viewType: 'overview' | 'performance';
}

export default function PerformanceCharts({ data, viewType }: Props) {
  const chartData = useMemo(() => {
    // Sort by timestamp
    const sorted = [...data].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return sorted.map((log, index) => ({
      id: log.id,
      index: index + 1,
      displayTime: new Date(log.timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      // Timing breakdowns (in ms)
      googleApiFetchMs: log.timings?.googleApiFetchMs || 0,
      tokenOperationsMs: log.timings?.tokenOperationsMs || 0,
      eventProcessingMs: log.timings?.eventProcessingMs || 0,
      databaseWritesMs: log.timings?.databaseWritesMs || 0,
      totalMs: log.timings?.totalMs || log.duration || 0,
      // API metrics
      apiCalls: log.apiMetrics?.callsCount || 0,
      apiPages: log.apiMetrics?.pagesFetched || 0,
      apiRetries: log.apiMetrics?.retryCount || 0,
      // Data volume
      eventsFetched: log.dataVolume?.eventsFetchedTotal || 0,
      eventsFiltered: log.dataVolume?.eventsFilteredOut || 0,
      eventsProcessed:
        (log.dataVolume?.eventsFetchedTotal || 0) -
        (log.dataVolume?.eventsFilteredOut || 0),
      batchCount: log.dataVolume?.batchCount || 0,
      // Events synced
      eventsAdded: log.events.added,
      eventsUpdated: log.events.updated,
      eventsDeleted: log.events.deleted,
      totalEvents: log.events.added + log.events.updated + log.events.deleted,
      // Status
      isSuccess: log.status === 'completed',
      isFailed: log.status === 'failed',
    }));
  }, [data]);

  const timingBreakdownConfig = {
    googleApiFetchMs: {
      label: 'Google API Fetch',
      color: 'hsl(217, 91%, 60%)',
    },
    tokenOperationsMs: {
      label: 'Token Operations',
      color: 'hsl(142, 76%, 36%)',
    },
    eventProcessingMs: {
      label: 'Event Processing',
      color: 'hsl(262, 83%, 58%)',
    },
    databaseWritesMs: {
      label: 'Database Writes',
      color: 'hsl(45, 93%, 47%)',
    },
  };

  const durationTrendConfig = {
    totalMs: {
      label: 'Sync Duration (ms)',
      color: 'hsl(217, 91%, 60%)',
    },
  };

  const apiMetricsConfig = {
    apiCalls: {
      label: 'API Calls',
      color: 'hsl(217, 91%, 60%)',
    },
    apiPages: {
      label: 'Pages Fetched',
      color: 'hsl(142, 76%, 36%)',
    },
    apiRetries: {
      label: 'Retries',
      color: 'hsl(0, 84%, 60%)',
    },
  };

  const eventVolumeConfig = {
    eventsProcessed: {
      label: 'Events Processed',
      color: 'hsl(142, 76%, 36%)',
    },
    eventsFiltered: {
      label: 'Events Filtered Out',
      color: 'hsl(45, 93%, 47%)',
    },
  };

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No sync data available
      </div>
    );
  }

  if (viewType === 'overview') {
    return (
      <div className="flex w-full flex-col gap-8">
        {/* Sync Duration Trend */}
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="font-semibold text-lg">Sync Duration Trend</h3>
            <p className="text-muted-foreground text-sm">
              Total sync duration over time (last {chartData.length} syncs)
            </p>
          </div>

          <ChartContainer config={durationTrendConfig} className="h-64 w-full">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="displayTime"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                label={{ value: 'ms', angle: -90, position: 'insideLeft' }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="totalMs"
                stroke="var(--color-totalMs)"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ChartContainer>
        </div>

        {/* Events Synced Trend */}
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="font-semibold text-lg">Events Synced Over Time</h3>
            <p className="text-muted-foreground text-sm">
              Number of events added, updated, and deleted
            </p>
          </div>

          <ChartContainer
            config={{
              eventsAdded: { label: 'Added', color: 'hsl(142, 76%, 36%)' },
              eventsUpdated: { label: 'Updated', color: 'hsl(45, 93%, 47%)' },
              eventsDeleted: { label: 'Deleted', color: 'hsl(0, 84%, 60%)' },
            }}
            className="h-64 w-full"
          >
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="displayTime"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="eventsAdded"
                fill="var(--color-eventsAdded)"
                radius={[4, 4, 0, 0]}
                stackId="events"
              />
              <Bar
                dataKey="eventsUpdated"
                fill="var(--color-eventsUpdated)"
                radius={[4, 4, 0, 0]}
                stackId="events"
              />
              <Bar
                dataKey="eventsDeleted"
                fill="var(--color-eventsDeleted)"
                radius={[4, 4, 0, 0]}
                stackId="events"
              />
            </BarChart>
          </ChartContainer>
        </div>
      </div>
    );
  }

  // Performance view - detailed breakdown
  return (
    <div className="flex w-full flex-col gap-8">
      {/* Timing Breakdown Stacked Area Chart */}
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="font-semibold text-lg">
            Performance Timing Breakdown
          </h3>
          <p className="text-muted-foreground text-sm">
            Detailed timing analysis showing where sync time is spent
          </p>
        </div>

        <ChartContainer config={timingBreakdownConfig} className="h-80 w-full">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="fillGoogleApi" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-googleApiFetchMs)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-googleApiFetchMs)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillToken" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-tokenOperationsMs)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-tokenOperationsMs)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillProcessing" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-eventProcessingMs)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-eventProcessingMs)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillDatabase" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-databaseWritesMs)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-databaseWritesMs)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="displayTime"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              label={{ value: 'ms', angle: -90, position: 'insideLeft' }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              type="monotone"
              dataKey="googleApiFetchMs"
              stackId="1"
              stroke="var(--color-googleApiFetchMs)"
              fill="url(#fillGoogleApi)"
            />
            <Area
              type="monotone"
              dataKey="tokenOperationsMs"
              stackId="1"
              stroke="var(--color-tokenOperationsMs)"
              fill="url(#fillToken)"
            />
            <Area
              type="monotone"
              dataKey="eventProcessingMs"
              stackId="1"
              stroke="var(--color-eventProcessingMs)"
              fill="url(#fillProcessing)"
            />
            <Area
              type="monotone"
              dataKey="databaseWritesMs"
              stackId="1"
              stroke="var(--color-databaseWritesMs)"
              fill="url(#fillDatabase)"
            />
          </AreaChart>
        </ChartContainer>
      </div>

      {/* API Performance Metrics */}
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="font-semibold text-lg">
            Google Calendar API Performance
          </h3>
          <p className="text-muted-foreground text-sm">
            API calls, pagination, and retry patterns
          </p>
        </div>

        <ChartContainer config={apiMetricsConfig} className="h-64 w-full">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="displayTime"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="apiCalls"
              fill="var(--color-apiCalls)"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="apiPages"
              fill="var(--color-apiPages)"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="apiRetries"
              fill="var(--color-apiRetries)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </div>

      {/* Event Volume Processing */}
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="font-semibold text-lg">Event Volume & Filtering</h3>
          <p className="text-muted-foreground text-sm">
            Events fetched vs. processed (after filtering)
          </p>
        </div>

        <ChartContainer config={eventVolumeConfig} className="h-64 w-full">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="displayTime"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              type="monotone"
              dataKey="eventsProcessed"
              stroke="var(--color-eventsProcessed)"
              fill="var(--color-eventsProcessed)"
              fillOpacity={0.3}
            />
            <Area
              type="monotone"
              dataKey="eventsFiltered"
              stroke="var(--color-eventsFiltered)"
              fill="var(--color-eventsFiltered)"
              fillOpacity={0.3}
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
}
