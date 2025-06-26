'use client';

import type { AuroraForecast } from '@tuturuuu/types/db';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
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

interface ModelDataPoint {
  date: string;
  actual?: number;
  predicted?: number;
  confidence_lower?: number;
  confidence_upper?: number;
  [key: string]: string | number | undefined;
}

interface ModelInsights {
  accuracy: number;
  trend: string;
  confidence: number;
  trendSlope: number;
  high: number;
  low: number;
}

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
  const getModelInsights = (
    modelData: ModelDataPoint[],
    _model: string
  ): ModelInsights | null => {
    if (!modelData.length) return null;

    const actualValues = modelData
      .map((point) => point.actual)
      .filter((value): value is number => typeof value === 'number');
    const predictedValues = modelData
      .map((point) => point.predicted)
      .filter((value): value is number => typeof value === 'number');

    if (actualValues.length === 0 || predictedValues.length === 0) return null;

    // Calculate accuracy (RMSE)
    const mse =
      actualValues.reduce((sum, actual, i) => {
        const predicted = predictedValues[i];
        return sum + (actual - predicted) ** 2;
      }, 0) / actualValues.length;
    const accuracy = Math.sqrt(mse);

    // Calculate trend
    const firstValue = actualValues[0];
    const lastValue = actualValues[actualValues.length - 1];
    const trendSlope = (lastValue - firstValue) / actualValues.length;
    const trend =
      trendSlope > 0 ? 'upward' : trendSlope < 0 ? 'downward' : 'stable';

    // Calculate confidence
    const confidenceValues = modelData
      .map((point) => {
        const lower = point.confidence_lower;
        const upper = point.confidence_upper;
        return typeof lower === 'number' && typeof upper === 'number'
          ? (upper - lower) / 2
          : null;
      })
      .filter((value): value is number => value !== null);

    const confidence =
      confidenceValues.length > 0
        ? confidenceValues.reduce((sum, val) => sum + val, 0) /
          confidenceValues.length
        : 0;

    return {
      accuracy,
      trend,
      confidence,
      trendSlope,
      high: Math.max(...actualValues),
      low: Math.min(...actualValues),
    };
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
                <h3 className="text-sm font-medium text-muted-foreground">
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
                      <span className="text-sm font-normal text-muted-foreground">
                        {t('aurora.slope')}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="transition-all duration-200 hover:shadow-md">
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground">
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
                    <span className="text-sm text-muted-foreground">
                      {formatPercentage(insights.volatility / insights.average)}{' '}
                      {t('aurora.relative')}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="transition-all duration-200 hover:shadow-md">
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t('aurora.prediction_insights')}
                </h3>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
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
                    <span className="text-sm text-muted-foreground">
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
                      <span className="font-medium text-destructive">
                        {formatCurrency(insights.low)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
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
