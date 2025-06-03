'use client';

import type { AuroraForecast } from '@ncthub/types/db';
import { Card, CardContent, CardHeader, CardTitle } from '@ncthub/ui/card';
import { ArrowDownIcon, ArrowUpIcon } from '@ncthub/ui/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ncthub/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ncthub/ui/tabs';
import { cn } from '@ncthub/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const COLORS = {
  light: {
    primary: '#2563eb',
    success: '#16a34a',
    warning: '#d97706',
    info: '#0891b2',
    grid: '#e5e7eb',
    axis: '#4b5563',
    low: '#f87171',
    high: '#34d399',
    tooltip: {
      bg: '#ffffff',
      border: '#e5e7eb',
      text: '#1f2937',
    },
    gradient: {
      primary: 'linear-gradient(135deg, #dbeafe 0%, #2563eb 100%)',
      success: 'linear-gradient(135deg, #dcfce7 0%, #16a34a 100%)',
      warning: 'linear-gradient(135deg, #fef3c7 0%, #d97706 100%)',
      info: 'linear-gradient(135deg, #cffafe 0%, #0891b2 100%)',
    },
  },
  dark: {
    primary: '#3b82f6',
    success: '#22c55e',
    warning: '#f59e0b',
    info: '#06b6d4',
    grid: '#374151',
    axis: '#9ca3af',
    low: '#f87171',
    high: '#34d399',
    tooltip: {
      bg: '#1f2937',
      border: '#374151',
      text: '#f3f4f6',
    },
    gradient: {
      primary: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
      success: 'linear-gradient(135deg, #14532d 0%, #22c55e 100%)',
      warning: 'linear-gradient(135deg, #78350f 0%, #f59e0b 100%)',
      info: 'linear-gradient(135deg, #164e63 0%, #06b6d4 100%)',
    },
  },
};

const formatDate = (
  locale: string,
  dateStr: string | undefined,
  showDay = true
) => {
  if (!dateStr) return '';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: showDay ? 'numeric' : undefined,
  }).format(new Date(dateStr));
};

const formatCurrency = (value: number, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatPercentage = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
};

const calculateTrend = (current: number, previous: number) => {
  const percentageChange = ((current - previous) / previous) * 100;
  return {
    direction:
      percentageChange > 0 ? 'up' : percentageChange < 0 ? 'down' : 'stable',
    percentage: Math.abs(percentageChange),
  };
};

const Dashboard = ({ data }: { data: AuroraForecast }) => {
  const locale = useLocale();
  const t = useTranslations();

  const { resolvedTheme } = useTheme();
  const colors = resolvedTheme === 'dark' ? COLORS.dark : COLORS.light;

  const [selectedModel, setSelectedModel] = useState('auto_arima');

  const chartData =
    data?.statistical_forecast?.map((item) => ({
      ...item,
      displayDate: formatDate(locale, item.date, false),
    })) || [];

  const mlChartData =
    data?.ml_forecast?.map((item) => ({
      ...item,
      displayDate: formatDate(locale, item.date, false),
    })) || [];

  // Calculate insights
  const getModelInsights = (modelData: any[], model: string) => {
    if (!modelData.length) return null;

    const values = modelData.map((d) => d[model] || 0);
    const sortedValues = [...values].sort((a, b) => a - b);
    const high = sortedValues[sortedValues.length - 1];
    const low = sortedValues[0];
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const volatility = Math.sqrt(
      values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / values.length
    );

    const trend = values[values.length - 1] - values[0];
    const trendPercentage = (trend / values[0]) * 100;

    return {
      high,
      low,
      average: avg,
      volatility,
      trend: trendPercentage,
    };
  };

  const insights = chartData.length
    ? getModelInsights(chartData, selectedModel)
    : null;

  return (
    <Card className="w-full">
      <CardHeader></CardHeader>

      <CardContent>
        <Tabs defaultValue="statistical" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="statistical">
              {t('aurora.statistical_models')}
            </TabsTrigger>
            <TabsTrigger value="ml">{t('aurora.ml_models')}</TabsTrigger>
          </TabsList>

          <TabsContent value="statistical" className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t('aurora_select_model')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto_arima">AutoARIMA</SelectItem>
                  <SelectItem value="auto_ets">AutoETS</SelectItem>
                  <SelectItem value="auto_theta">AutoTheta</SelectItem>
                  <SelectItem value="ces">CES</SelectItem>
                </SelectContent>
              </Select>

              {insights && (
                <div className="text-muted-foreground text-sm">
                  {t('aurora.last_updated')}:{' '}
                  {formatDate(
                    locale,
                    chartData[chartData.length - 1]?.created_at
                  )}
                </div>
              )}
            </div>

            {insights && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title={t('aurora.current_price')}
                  value={getCurrentPrice(chartData, selectedModel) || 0}
                  previousValue={getCurrentPrice(chartData, selectedModel) || 0}
                  type="currency"
                />
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      {t('aurora.forecast_range')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">
                          {t('aurora.high')}
                        </span>
                        <span className="text-success font-medium">
                          {formatCurrency(insights.high)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">
                          {t('aurora.low')}
                        </span>
                        <span className="text-destructive font-medium">
                          {formatCurrency(insights.low)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">
                          {t('aurora.average')}
                        </span>
                        <span className="font-medium">
                          {formatCurrency(insights.average)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      {t('aurora.trend')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      {insights.trend > 0 ? (
                        <ArrowUpIcon className="text-success h-4 w-4" />
                      ) : (
                        <ArrowDownIcon className="text-destructive h-4 w-4" />
                      )}
                      <span
                        className={
                          insights.trend > 0
                            ? 'text-success'
                            : 'text-destructive'
                        }
                      >
                        {formatPercentage(insights.trend)}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      {t('aurora.volatility')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-medium">
                        {formatCurrency(insights.volatility)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <Card>
              <CardContent className="pt-6">
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={colors.grid}
                      />
                      <XAxis
                        dataKey="displayDate"
                        stroke={colors.axis}
                        tick={{ fill: colors.axis, fontSize: 12 }}
                        tickMargin={10}
                      />
                      <YAxis
                        stroke={colors.axis}
                        tick={{ fill: colors.axis, fontSize: 12 }}
                        tickMargin={10}
                        tickFormatter={(value) => formatCurrency(value)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: colors.tooltip.bg,
                          border: `1px solid ${colors.tooltip.border}`,
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                          borderRadius: '6px',
                          padding: '8px 12px',
                        }}
                        formatter={(value: number) => [formatCurrency(value)]}
                        labelStyle={{ color: colors.tooltip.text }}
                      />
                      <Legend
                        wrapperStyle={{
                          paddingTop: '20px',
                        }}
                        formatter={(value) => <span>{value}</span>}
                      />
                      <Line
                        type="monotone"
                        dataKey={`${selectedModel}_hi_90`}
                        stroke={colors.high}
                        strokeDasharray="3 3"
                        dot={false}
                        name={t('aurora.90_confidence_high')}
                      />
                      <Line
                        type="monotone"
                        dataKey={selectedModel}
                        stroke={colors.primary}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{
                          r: 6,
                          fill: colors.primary,
                          strokeWidth: 0,
                        }}
                        name={selectedModel}
                        animationDuration={300}
                      />
                      <Line
                        type="monotone"
                        dataKey={`${selectedModel}_lo_90`}
                        stroke={colors.low}
                        strokeDasharray="3 3"
                        dot={false}
                        name={t('aurora.90_confidence_lo')}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ml">
            <Card>
              <CardContent className="pt-6">
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mlChartData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={colors.grid}
                      />
                      <XAxis
                        dataKey="displayDate"
                        stroke={colors.axis}
                        tick={{ fill: colors.axis, fontSize: 12 }}
                        tickMargin={10}
                      />
                      <YAxis
                        stroke={colors.axis}
                        tick={{ fill: colors.axis, fontSize: 12 }}
                        tickMargin={10}
                        tickFormatter={(value) => formatCurrency(value)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: colors.tooltip.bg,
                          border: `1px solid ${colors.tooltip.border}`,
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                          borderRadius: '6px',
                          padding: '8px 12px',
                        }}
                        formatter={(value: number) => [formatCurrency(value)]}
                        labelStyle={{ color: colors.tooltip.text }}
                      />
                      <Legend
                        wrapperStyle={{
                          paddingTop: '20px',
                        }}
                        formatter={(value) => <span>{value}</span>}
                      />
                      <Line
                        type="monotone"
                        dataKey="elasticnet"
                        stroke={colors.primary}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{
                          r: 6,
                          fill: colors.primary,
                          strokeWidth: 0,
                        }}
                        name="elasticnet"
                        animationDuration={300}
                      />
                      <Line
                        type="monotone"
                        dataKey="lightgbm"
                        stroke={colors.success}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{
                          r: 6,
                          fill: colors.success,
                          strokeWidth: 0,
                        }}
                        name="lightgbm"
                        animationDuration={300}
                      />
                      <Line
                        type="monotone"
                        dataKey="xgboost"
                        stroke={colors.warning}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{
                          r: 6,
                          fill: colors.warning,
                          strokeWidth: 0,
                        }}
                        name="xgboost"
                        animationDuration={300}
                      />
                      <Line
                        type="monotone"
                        dataKey="catboost"
                        stroke={colors.info}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{
                          r: 6,
                          fill: colors.info,
                          strokeWidth: 0,
                        }}
                        name="catboost"
                        animationDuration={300}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

interface MetricCardProps {
  title: string;
  value: number;
  previousValue?: number;
  type: 'currency' | 'percentage' | 'number';
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
  };
  color?: string;
  gradient?: string;
}

const MetricCard = ({
  title,
  value,
  previousValue,
  type,
  trend,
  color,
  gradient,
}: MetricCardProps) => {
  const { resolvedTheme } = useTheme();
  const colors = resolvedTheme === 'dark' ? COLORS.dark : COLORS.light;

  const formattedValue =
    type === 'currency'
      ? formatCurrency(value)
      : type === 'percentage'
        ? formatPercentage(value)
        : value.toLocaleString();

  const calculatedTrend =
    trend || (previousValue ? calculateTrend(value, previousValue) : undefined);

  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-muted-foreground text-sm font-medium">{title}</h3>
          {calculatedTrend && (
            <div
              className={cn(
                'flex items-center gap-1 text-sm font-medium',
                calculatedTrend.direction === 'up'
                  ? 'text-success'
                  : calculatedTrend.direction === 'down'
                    ? 'text-destructive'
                    : 'text-muted-foreground'
              )}
            >
              {calculatedTrend.direction === 'up'
                ? '↗'
                : calculatedTrend.direction === 'down'
                  ? '↘'
                  : '→'}{' '}
              {formatPercentage(calculatedTrend.percentage)}
            </div>
          )}
        </div>

        <div className="mt-4">
          <div
            className="text-2xl font-bold"
            style={{ color: color || colors.primary }}
          >
            {formattedValue}
          </div>
          <div className="mt-2">
            <div className="bg-muted/20 h-2 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: type === 'percentage' ? `${value}%` : '100%',
                  background: gradient || colors.gradient.primary,
                }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const getCurrentPrice = (data: any[], model: string) => {
  return data.length > 0 ? data[data.length - 1][model] || 0 : 0;
};

export default Dashboard;
