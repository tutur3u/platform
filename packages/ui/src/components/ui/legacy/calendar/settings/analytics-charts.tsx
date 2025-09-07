'use client';

import type {
  CalendarSourceData,
  EventTypeData,
  TimeSeriesData,
  WorkspaceActivityData,
} from './types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Activity, BarChart3, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

interface AnalyticsChartsProps {
  timeSeriesData: TimeSeriesData[];
  eventTypeData: EventTypeData[];
  workspaceActivityData: WorkspaceActivityData[];
  calendarSourceData: CalendarSourceData[];
}

export function AnalyticsCharts({
  timeSeriesData,
  eventTypeData,
  workspaceActivityData,
  calendarSourceData,
}: AnalyticsChartsProps) {
  return (
    <Card className="border-0 bg-foreground/10 shadow-sm backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-dynamic-blue" />
          <CardTitle className="text-xl">Analytics & Insights</CardTitle>
        </div>
        <CardDescription className="opacity-70">
          Comprehensive sync performance and trend analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="workspaces">Workspaces</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-4 w-4 text-dynamic-blue" />
                    Sync Activity (24h)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ChartContainer
                    config={{
                      syncs: {
                        label: 'Total Syncs',
                        color: 'hsl(var(--chart-1))',
                      },
                      success: {
                        label: 'Successful',
                        color: 'hsl(var(--chart-2))',
                      },
                    }}
                    className="h-[300px] w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={timeSeriesData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-slate-200"
                        />
                        <XAxis dataKey="time" className="text-xs" />
                        <YAxis className="text-xs" />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Area
                          type="monotone"
                          dataKey="syncs"
                          stackId="1"
                          stroke="var(--color-syncs)"
                          fill="var(--color-syncs)"
                          fillOpacity={0.6}
                        />
                        <Area
                          type="monotone"
                          dataKey="success"
                          stackId="2"
                          stroke="var(--color-success)"
                          fill="var(--color-success)"
                          fillOpacity={0.8}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Activity className="h-4 w-4 text-dynamic-green" />
                    Event Changes Over Time
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ChartContainer
                    config={{
                      added: {
                        label: 'Added',
                        color: 'hsl(var(--chart-1))',
                      },
                      updated: {
                        label: 'Updated',
                        color: 'hsl(var(--chart-2))',
                      },
                      deleted: {
                        label: 'Deleted',
                        color: 'hsl(var(--chart-3))',
                      },
                    }}
                    className="h-[300px] w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={eventTypeData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-slate-200"
                        />
                        <XAxis dataKey="period" className="text-xs" />
                        <YAxis className="text-xs" />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Bar
                          dataKey="added"
                          fill="var(--color-added)"
                          radius={[2, 2, 0, 0]}
                        />
                        <Bar
                          dataKey="updated"
                          fill="var(--color-updated)"
                          radius={[2, 2, 0, 0]}
                        />
                        <Bar
                          dataKey="deleted"
                          fill="var(--color-deleted)"
                          radius={[2, 2, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="performance" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Sync Duration Trends
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ChartContainer
                    config={{
                      duration: {
                        label: 'Duration (ms)',
                        color: 'hsl(var(--chart-4))',
                      },
                    }}
                    className="h-[300px] w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={timeSeriesData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-slate-200"
                        />
                        <XAxis dataKey="time" className="text-xs" />
                        <YAxis className="text-xs" />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line
                          type="monotone"
                          dataKey="duration"
                          stroke="var(--color-duration)"
                          strokeWidth={2}
                          dot={{
                            fill: 'var(--color-duration)',
                            strokeWidth: 2,
                            r: 4,
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Success Rate Trend</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ChartContainer
                    config={{
                      success: {
                        label: 'Success Rate',
                        color: 'hsl(var(--chart-2))',
                      },
                      failed: {
                        label: 'Failed',
                        color: 'hsl(var(--chart-5))',
                      },
                    }}
                    className="h-[300px] w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={timeSeriesData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-slate-200"
                        />
                        <XAxis dataKey="time" className="text-xs" />
                        <YAxis className="text-xs" />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Area
                          type="monotone"
                          dataKey="success"
                          stackId="1"
                          stroke="var(--color-success)"
                          fill="var(--color-success)"
                          fillOpacity={0.8}
                        />
                        <Area
                          type="monotone"
                          dataKey="failed"
                          stackId="1"
                          stroke="var(--color-failed)"
                          fill="var(--color-failed)"
                          fillOpacity={0.8}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="workspaces" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Workspace Activity Comparison
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ChartContainer
                  config={{
                    syncs: {
                      label: 'Syncs',
                      color: 'hsl(var(--chart-1))',
                    },
                    events: {
                      label: 'Events',
                      color: 'hsl(var(--chart-2))',
                    },
                  }}
                  className="h-[400px] w-full"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={workspaceActivityData} layout="horizontal">
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-slate-200"
                      />
                      <XAxis type="number" className="text-xs" />
                      <YAxis
                        dataKey="name"
                        type="category"
                        className="text-xs"
                        width={120}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar
                        dataKey="syncs"
                        fill="var(--color-syncs)"
                        radius={[0, 4, 4, 0]}
                      />
                      <Bar
                        dataKey="events"
                        fill="var(--color-events)"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sources" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Calendar Source Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ChartContainer
                    config={{
                      google: {
                        label: 'Google Calendar',
                        color: '#4285f4',
                      },
                      outlook: {
                        label: 'Outlook Calendar',
                        color: '#0078d4',
                      },
                      apple: {
                        label: 'Apple Calendar',
                        color: '#007aff',
                      },
                    }}
                    className="h-[300px] w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={calendarSourceData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={120}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {calendarSourceData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <ChartLegend content={<ChartLegendContent />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Source Performance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {calendarSourceData.map((source, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-lg bg-foreground/10 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: source.color }}
                        />
                        <span className="font-medium">{source.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">{source.value}%</div>
                        <div className="text-xs opacity-70">of total syncs</div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
