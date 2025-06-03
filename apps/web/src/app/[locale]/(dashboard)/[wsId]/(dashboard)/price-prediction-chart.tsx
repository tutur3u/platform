'use client';

import type { AuroraForecast } from '@ncthub/types/db';
import { Card, CardContent, CardHeader, CardTitle } from '@ncthub/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ncthub/ui/select';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import {
  Area,
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
    primary: '#2563eb', // Blue 600
    success: '#16a34a', // Green 600
    warning: '#d97706', // Amber 600
    info: '#0891b2', // Cyan 600
    grid: '#e5e7eb', // Gray 200
    axis: '#4b5563', // Gray 600
    confidence: 'rgba(37, 99, 235, 0.15)', // Blue 600 with opacity
    tooltip: {
      bg: '#ffffff',
      border: '#e5e7eb',
      text: '#1f2937',
    },
  },
  dark: {
    primary: '#3b82f6', // Blue 500
    success: '#22c55e', // Green 500
    warning: '#f59e0b', // Amber 500
    info: '#06b6d4', // Cyan 500
    grid: '#374151', // Gray 700
    axis: '#9ca3af', // Gray 400
    confidence: 'rgba(59, 130, 246, 0.15)', // Blue 500 with opacity
    tooltip: {
      bg: '#1f2937',
      border: '#374151',
      text: '#f3f4f6',
    },
  },
};

const formatDate = (locale: string, dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'short' });
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
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

const PricePredictionChart = ({ data }: { data: AuroraForecast }) => {
  const locale = useLocale();
  const t = useTranslations();

  const { resolvedTheme } = useTheme();
  const colors = resolvedTheme === 'dark' ? COLORS.dark : COLORS.light;
  const [selectedModel, setSelectedModel] = useState('elasticnet');

  const chartData =
    data?.ml_forecast?.map((forecast) => ({
      ...forecast,
      displayDate: formatDate(locale, forecast.date),
    })) || [];

  // Calculate insights
  const getModelInsights = (modelData: any[], model: string) => {
    if (!modelData.length) return null;

    const values = modelData.map((d) => d[model] || 0);
    const sortedValues = [...values].sort((a, b) => a - b);
    const high = sortedValues[sortedValues.length - 1];
    const low = sortedValues[0];
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    // Calculate volatility (standard deviation)
    const volatility = Math.sqrt(
      values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / values.length
    );

    // Calculate trend
    const trendWindow = Math.min(30, values.length);
    const recentValues = values.slice(-trendWindow);
    const trendSlope = calculateTrendSlope(recentValues);

    return {
      high,
      low,
      average: avg,
      volatility,
      trendSlope,
    };
  };

  const calculateTrendSlope = (values: number[]) => {
    const n = values.length;
    if (n < 2) return 0;

    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      const x = i;
      const y = values[i];
      if (typeof y === 'number') {
        numerator += (x - xMean) * (y - yMean);
        denominator += Math.pow(x - xMean, 2);
      }
    }

    return denominator === 0 ? 0 : numerator / denominator;
  };

  const insights = chartData.length
    ? getModelInsights(chartData, selectedModel)
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{t('aurora.ml_price_prediction')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col items-start justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('aurora_select_model')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="elasticnet">elasticnet</SelectItem>
              <SelectItem value="lightgbm">lightgbm</SelectItem>
              <SelectItem value="xgboost">xgboost</SelectItem>
              <SelectItem value="catboost">catboost</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {insights && (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="transition-all duration-200 hover:shadow-md">
              <CardContent className="pt-6">
                <h3 className="text-muted-foreground text-sm font-medium">
                  {t('aurora.trend')}
                </h3>
                <div className="mt-2">
                  <div
                    className={`flex items-center gap-2 text-2xl font-bold ${
                      insights.trendSlope > 0
                        ? 'text-success'
                        : 'text-destructive'
                    }`}
                  >
                    {insights.trendSlope > 0 ? '↗' : '↘'}{' '}
                    <div className="flex flex-col">
                      <span>{Math.abs(insights.trendSlope).toFixed(2)}</span>
                      <span className="text-muted-foreground text-sm font-normal">
                        {t('aurora.slope')}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="transition-all duration-200 hover:shadow-md">
              <CardContent className="pt-6">
                <h3 className="text-muted-foreground text-sm font-medium">
                  {t('aurora.volatility')}
                </h3>
                <div className="mt-2">
                  <div className="text-2xl font-bold">
                    {formatCurrency(insights.volatility)}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${Math.min(
                          (insights.volatility / insights.average) * 100,
                          100
                        )}%`,
                        backgroundColor: colors.info,
                      }}
                    />
                    <span className="text-muted-foreground text-sm">
                      {formatPercentage(insights.volatility / insights.average)}{' '}
                      {t('aurora.relative')}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="transition-all duration-200 hover:shadow-md">
              <CardContent className="pt-6">
                <h3 className="text-muted-foreground text-sm font-medium">
                  {t('aurora.prediction_insights')}
                </h3>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">
                      {t('aurora.high')}
                    </span>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${(insights.high / insights.high) * 100}%`,
                          backgroundColor: colors.success,
                        }}
                      />
                      <span className="text-success font-medium">
                        {formatCurrency(insights.high)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">
                      {t('aurora.low')}
                    </span>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${(insights.low / insights.high) * 100}%`,
                          backgroundColor: colors.warning,
                        }}
                      />
                      <span className="text-destructive font-medium">
                        {formatCurrency(insights.low)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">
                      {t('aurora.average')}
                    </span>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${(insights.average / insights.high) * 100}%`,
                          backgroundColor: colors.primary,
                        }}
                      />
                      <span className="font-medium">
                        {formatCurrency(insights.average)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
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
              <Area
                type="monotone"
                dataKey={`${selectedModel}_hi_90`}
                stroke="none"
                fill={colors.confidence}
                fillOpacity={1}
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
              <Area
                type="monotone"
                dataKey={`${selectedModel}_lo_90`}
                stroke="none"
                fill={colors.confidence}
                fillOpacity={1}
                name={t('aurora.90_confidence_lo')}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default PricePredictionChart;
