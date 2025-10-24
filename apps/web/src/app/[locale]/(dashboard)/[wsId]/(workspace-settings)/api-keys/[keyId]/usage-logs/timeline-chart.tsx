'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useCallback, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';

interface TimelineData {
  date: string;
  statusGroups: Record<string, number>;
  endpointGroups: Record<string, number>;
}

interface TimelineChartProps {
  data: TimelineData[];
}

type GroupByType = 'status' | 'endpoint';
type ChartType = 'area' | 'bar';

export function TimelineChart({ data }: TimelineChartProps) {
  const t = useTranslations('ws-api-keys');
  const { resolvedTheme } = useTheme();
  const [groupBy, setGroupBy] = useState<GroupByType>('endpoint');
  const [chartType, setChartType] = useState<ChartType>('bar');

  // Theme-aware colors
  const colors = useCallback(
    () => ({
      success: resolvedTheme === 'dark' ? '#4ade80' : '#16a34a', // green
      clientError: resolvedTheme === 'dark' ? '#fb923c' : '#ea580c', // orange
      serverError: resolvedTheme === 'dark' ? '#f87171' : '#dc2626', // red
      redirect: resolvedTheme === 'dark' ? '#60a5fa' : '#2563eb', // blue
      endpoint1: resolvedTheme === 'dark' ? '#a78bfa' : '#7c3aed', // purple
      endpoint2: resolvedTheme === 'dark' ? '#f472b6' : '#db2777', // pink
      endpoint3: resolvedTheme === 'dark' ? '#34d399' : '#059669', // emerald
      endpoint4: resolvedTheme === 'dark' ? '#fbbf24' : '#d97706', // amber
      endpoint5: resolvedTheme === 'dark' ? '#38bdf8' : '#0284c7', // sky
    }),
    [resolvedTheme]
  )();

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    return data.map((item) => {
      const formattedDate = new Date(item.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });

      const base = {
        date: formattedDate,
        fullDate: item.date,
      };

      if (groupBy === 'status') {
        return {
          ...base,
          '2xx': item.statusGroups['2xx'] || 0,
          '4xx': item.statusGroups['4xx'] || 0,
          '5xx': item.statusGroups['5xx'] || 0,
          '3xx': item.statusGroups['3xx'] || 0,
        };
      }

      // Group by endpoint - limit to top 5 endpoints across all data
      const allEndpoints = new Map<string, number>();
      for (const d of data) {
        Object.entries(d.endpointGroups).forEach(([endpoint, count]) => {
          allEndpoints.set(endpoint, (allEndpoints.get(endpoint) || 0) + count);
        });
      }

      const topEndpoints = Array.from(allEndpoints.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([endpoint]) => endpoint);

      const endpointData: Record<string, number> = {};
      for (const endpoint of topEndpoints) {
        const shortEndpoint =
          endpoint.length > 30 ? `...${endpoint.slice(-27)}` : endpoint;
        endpointData[shortEndpoint] = item.endpointGroups[endpoint] || 0;
      }

      return {
        ...base,
        ...endpointData,
      };
    });
  }, [data, groupBy]);

  const chartConfig: ChartConfig = useMemo(() => {
    if (groupBy === 'status') {
      return {
        '2xx': {
          label: t('success_2xx'),
          color: colors.success,
        },
        '4xx': {
          label: t('client_error_4xx'),
          color: colors.clientError,
        },
        '5xx': {
          label: t('server_error_5xx'),
          color: colors.serverError,
        },
        '3xx': {
          label: t('redirect_3xx'),
          color: colors.redirect,
        },
      } satisfies ChartConfig;
    }

    // For endpoints, generate dynamic config
    const endpoints = new Set<string>();
    for (const d of chartData) {
      Object.keys(d).forEach((key) => {
        if (key !== 'date' && key !== 'fullDate') {
          endpoints.add(key);
        }
      });
    }

    const endpointColors = [
      colors.endpoint1,
      colors.endpoint2,
      colors.endpoint3,
      colors.endpoint4,
      colors.endpoint5,
    ];

    return Array.from(endpoints).reduce((acc, endpoint, index) => {
      acc[endpoint] = {
        label: endpoint,
        color: endpointColors[index % endpointColors.length],
      };
      return acc;
    }, {} as ChartConfig);
  }, [groupBy, chartData, t, colors]);

  const totalRequests = useMemo(() => {
    return data.reduce((sum, item) => {
      return (
        sum +
        Object.values(item.statusGroups).reduce((s, count) => s + count, 0)
      );
    }, 0);
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('request_timeline')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground text-sm">
            {t('no_data_available')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const dateRange =
    data.length > 0 && data[0]?.date && data?.[data.length - 1]?.date
      ? `${new Date(data[0].date).toLocaleDateString()} - ${new Date(data[data.length - 1]!.date).toLocaleDateString()}`
      : '';

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {t('request_timeline')}
              </CardTitle>
              <p className="mt-1 text-muted-foreground text-sm">
                {dateRange} • {totalRequests.toLocaleString()}{' '}
                {t('total_requests').toLowerCase()}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                value={groupBy}
                onValueChange={(value) => setGroupBy(value as GroupByType)}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="status">{t('group_by_status')}</SelectItem>
                  <SelectItem value="endpoint">
                    {t('group_by_endpoint')}
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={chartType}
                onValueChange={(value) => setChartType(value as ChartType)}
              >
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="area">{t('area_chart')}</SelectItem>
                  <SelectItem value="bar">{t('bar_chart')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[350px] w-full">
          {chartType === 'area' ? (
            <AreaChart data={chartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                opacity={0.3}
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                angle={-45}
                textAnchor="end"
                height={60}
                tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
              />
              <ChartTooltip
                content={<ChartTooltipContent indicator="dot" />}
                cursor={{ fill: 'hsl(var(--foreground))', opacity: 0.05 }}
              />
              {Object.keys(chartConfig).map((key) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stackId="1"
                  stroke={chartConfig[key]?.color}
                  fill={chartConfig[key]?.color}
                  fillOpacity={0.6}
                />
              ))}
            </AreaChart>
          ) : (
            <BarChart data={chartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                opacity={0.3}
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                angle={-45}
                textAnchor="end"
                height={60}
                tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
              />
              <ChartTooltip
                content={<ChartTooltipContent indicator="dot" />}
                cursor={{ fill: 'hsl(var(--foreground))', opacity: 0.05 }}
              />
              {Object.keys(chartConfig).map((key, index, array) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="1"
                  fill={chartConfig[key]?.color}
                  stroke={chartConfig[key]?.color}
                  radius={index === array.length - 1 ? [4, 4, 0, 0] : 0}
                  maxBarSize={50}
                />
              ))}
            </BarChart>
          )}
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
