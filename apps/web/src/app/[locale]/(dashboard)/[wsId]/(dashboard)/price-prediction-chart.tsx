'use client';

import { fetchAuroraForecast } from '@/lib/aurora';
import type { AuroraForecast } from '@tutur3u/types/db';
import { Card, CardContent, CardHeader, CardTitle } from '@tutur3u/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tutur3u/ui/select';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
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
    text: '#1f2937', // Gray 800
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
    text: '#f3f4f6', // Gray 100
    confidence: 'rgba(59, 130, 246, 0.15)', // Blue 500 with opacity
    tooltip: {
      bg: '#1f2937',
      border: '#374151',
      text: '#f3f4f6',
    },
  },
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
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

const PricePredictionChart = () => {
  const { resolvedTheme } = useTheme();
  const colors = resolvedTheme === 'dark' ? COLORS.dark : COLORS.light;
  const [selectedModel, setSelectedModel] = useState('elasticnet');
  const [data, setData] = useState<AuroraForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<[Date, Date] | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetchAuroraForecast();
        setData(response);
      } catch (error) {
        console.error('Failed to fetch forecast:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const translations = {
    en: {
      pricePrediction: 'ML Model Price Prediction',
      selectModel: 'Select Model',
      elasticnet: 'ElasticNet',
      lightgbm: 'LightGBM',
      xgboost: 'XGBoost',
      catboost: 'CatBoost',
      actual: 'Actual',
      predicted: 'Predicted',
      timeRange: 'Time Range',
      all: 'All Time',
      last30Days: 'Last 30 Days',
      last7Days: 'Last 7 Days',
      custom: 'Custom',
      confidenceInterval: '90% Confidence Interval',
      predictionInsights: 'Prediction Insights',
      accuracy: 'Prediction Accuracy',
      trend: 'Price Trend',
      volatility: 'Price Volatility',
    },
    vi: {
      // ... existing translations
    },
  };

  const t = translations['en'];

  const chartData =
    data?.ml_forecast?.map((forecast) => ({
      ...forecast,
      displayDate: formatDate(forecast.date),
    })) || [];

  // Filter data based on date range
  const filteredChartData = dateRange
    ? chartData.filter((d) => {
        const date = new Date(d.date);
        return date >= dateRange[0] && date <= dateRange[1];
      })
    : chartData;

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

    // Calculate momentum
    const momentum = calculateMomentum(values);

    return {
      high,
      low,
      average: avg,
      volatility,
      trendSlope,
      momentum,
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

  const calculateMomentum = (values: number[]) => {
    if (values.length < 2) return 0;

    const current = values[values.length - 1];
    const previous = values[values.length - 2];

    if (
      typeof current !== 'number' ||
      typeof previous !== 'number' ||
      previous === 0
    ) {
      return 0;
    }

    return ((current - previous) / previous) * 100;
  };

  const insights = filteredChartData.length
    ? getModelInsights(filteredChartData, selectedModel)
    : null;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.pricePrediction}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[400px] items-center justify-center">
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{t.pricePrediction}</CardTitle>
          <div className="flex items-center gap-2">
            <Select
              value={dateRange ? 'custom' : 'all'}
              onValueChange={(value) => {
                const now = new Date();
                switch (value) {
                  case 'last7Days':
                    setDateRange([
                      new Date(now.setDate(now.getDate() - 7)),
                      new Date(),
                    ]);
                    break;
                  case 'last30Days':
                    setDateRange([
                      new Date(now.setDate(now.getDate() - 30)),
                      new Date(),
                    ]);
                    break;
                  default:
                    setDateRange(null);
                }
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={t.timeRange} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.all}</SelectItem>
                <SelectItem value="last30Days">{t.last30Days}</SelectItem>
                <SelectItem value="last7Days">{t.last7Days}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col items-start justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t.selectModel} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="elasticnet">{t.elasticnet}</SelectItem>
              <SelectItem value="lightgbm">{t.lightgbm}</SelectItem>
              <SelectItem value="xgboost">{t.xgboost}</SelectItem>
              <SelectItem value="catboost">{t.catboost}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {insights && (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="transition-all duration-200 hover:shadow-md">
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t.trend}
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
                        slope
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${Math.min(Math.abs(insights.momentum), 100)}%`,
                        backgroundColor:
                          insights.momentum > 0
                            ? colors.success
                            : colors.warning,
                      }}
                    />
                    <span className="text-sm text-muted-foreground">
                      {formatPercentage(insights.momentum)} momentum
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="transition-all duration-200 hover:shadow-md">
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t.volatility}
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
                      relative
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="transition-all duration-200 hover:shadow-md">
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t.predictionInsights}
                </h3>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">High</span>
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
                    <span className="text-sm text-muted-foreground">Low</span>
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
                      Average
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
            <LineChart data={filteredChartData}>
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
                formatter={(value) => (
                  <span style={{ color: colors.text }}>
                    {t[value as keyof typeof t] || value}
                  </span>
                )}
              />
              <Area
                type="monotone"
                dataKey={`${selectedModel}_lo_90`}
                stroke="none"
                fill={colors.confidence}
                fillOpacity={1}
                name={t.confidenceInterval}
              />
              <Area
                type="monotone"
                dataKey={`${selectedModel}_hi_90`}
                stroke="none"
                fill={colors.confidence}
                fillOpacity={1}
                name={t.confidenceInterval}
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
                name={t[selectedModel as keyof typeof t]}
                animationDuration={300}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default PricePredictionChart;
