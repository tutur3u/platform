'use client';

import { fetchAuroraForecast } from '@/lib/aurora';
import type { AuroraForecast } from '@tutur3u/types/db';
import { Alert, AlertDescription, AlertTitle } from '@tutur3u/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@tutur3u/ui/card';
import { useToast } from '@tutur3u/ui/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tutur3u/ui/select';
import { Skeleton } from '@tutur3u/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tutur3u/ui/tabs';
import { cn } from '@tutur3u/utils/format';
import { AlertCircle, ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
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
    text: '#1f2937',
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
    text: '#f3f4f6',
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

const formatDate = (dateStr: string | undefined) => {
  if (!dateStr) return '';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

const Dashboard = () => {
  const { resolvedTheme } = useTheme();
  const colors = resolvedTheme === 'dark' ? COLORS.dark : COLORS.light;
  const [selectedModel, setSelectedModel] = useState('auto_arima');
  const [data, setData] = useState<AuroraForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[Date, Date] | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetchAuroraForecast();
        setData(response);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to fetch forecast data';
        setError(message);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: message,
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [toast]);

  const translations = {
    en: {
      dashboard: 'Aurora Dashboard',
      selectModel: 'Select Model:',
      statisticalModels: 'Statistical Models',
      mlModels: 'ML Models',
      price: 'Price (USD/ton)',
      currentPrice: 'Current Price',
      change24h: '24h Change',
      weeklyTrend: 'Weekly Trend',
      monthlyTrend: 'Monthly Trend',
      error: 'Error',
      tryAgain: 'Try Again',
      loading: 'Loading dashboard data...',
      auto_arima: 'AutoARIMA',
      auto_ets: 'AutoETS',
      auto_theta: 'AutoTheta',
      ces: 'CES',
      elasticnet: 'ElasticNet',
      lightgbm: 'LightGBM',
      xgboost: 'XGBoost',
      catboost: 'CatBoost',
      insights: 'Model Insights',
      accuracy: 'Prediction Accuracy',
      trend: 'Price Trend',
      volatility: 'Price Volatility',
      forecastRange: 'Forecast Range',
      high: 'High',
      low: 'Low',
      average: 'Average',
      lastUpdated: 'Last Updated',
      timeRange: 'Time Range',
      all: 'All Time',
      last30Days: 'Last 30 Days',
      last7Days: 'Last 7 Days',
      custom: 'Custom',
    },
    vi: {
      dashboard: 'Bảng điều khiển',
      selectModel: 'Chọn mô hình:',
      AutoARIMA: 'AutoARIMA',
      AutoETS: 'AutoETS',
      AutoTheta: 'AutoTheta',
      CES: 'CES',
      priceTrends: 'Xu hướng giá',
      date: 'Ngày',
      price: 'Giá (USD/tấn)',
      currentPrice: 'Giá hiện tại',
      change24h: 'Thay đổi 24h',
      weeklyTrend: 'Xu hướng tuần',
      monthlyTrend: 'Xu hướng tháng',
    },
  };

  const t = translations['en'];

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Skeleton className="h-6 w-[200px]" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-[60px] w-full" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[100px] w-full" />
              ))}
            </div>
            <Skeleton className="h-[400px] w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t.dashboard}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t.error}</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              {error}
              <button
                onClick={() => window.location.reload()}
                className="w-fit rounded-md bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20"
              >
                {t.tryAgain}
              </button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const chartData =
    data?.statistical_forecast?.map((item) => ({
      ...item,
      displayDate: formatDate(item.date),
    })) || [];

  const mlChartData =
    data?.ml_forecast?.map((item) => ({
      ...item,
      displayDate: formatDate(item.date),
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

  // Filter data based on date range
  const filteredChartData = dateRange
    ? chartData.filter((d) => {
        const date = new Date(d.date);
        return date >= dateRange[0] && date <= dateRange[1];
      })
    : chartData;

  const filteredMlChartData = dateRange
    ? mlChartData.filter((d) => {
        const date = new Date(d.date);
        return date >= dateRange[0] && date <= dateRange[1];
      })
    : mlChartData;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{t.dashboard}</CardTitle>
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
        <Tabs defaultValue="statistical" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="statistical">{t.statisticalModels}</TabsTrigger>
            <TabsTrigger value="ml">{t.mlModels}</TabsTrigger>
          </TabsList>

          <TabsContent value="statistical" className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t.selectModel} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto_arima">{t.auto_arima}</SelectItem>
                  <SelectItem value="auto_ets">{t.auto_ets}</SelectItem>
                  <SelectItem value="auto_theta">{t.auto_theta}</SelectItem>
                  <SelectItem value="ces">{t.ces}</SelectItem>
                </SelectContent>
              </Select>

              {insights && (
                <div className="text-sm text-muted-foreground">
                  {t.lastUpdated}:{' '}
                  {formatDate(chartData[chartData.length - 1]?.date)}
                </div>
              )}
            </div>

            {insights && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title={t.currentPrice}
                  value={getCurrentPrice(filteredChartData, selectedModel) || 0}
                  previousValue={
                    getCurrentPrice(filteredChartData, selectedModel) || 0
                  }
                  type="currency"
                />
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      {t.forecastRange}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {t.high}
                        </span>
                        <span className="text-success font-medium">
                          {formatCurrency(insights.high)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {t.low}
                        </span>
                        <span className="font-medium text-destructive">
                          {formatCurrency(insights.low)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {t.average}
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
                      {t.trend}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      {insights.trend > 0 ? (
                        <ArrowUpIcon className="text-success h-4 w-4" />
                      ) : (
                        <ArrowDownIcon className="h-4 w-4 text-destructive" />
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
                      {t.volatility}
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
                    <LineChart data={filteredChartData}>
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
                        formatter={(value) => (
                          <span style={{ color: colors.text }}>
                            {t[value as keyof typeof t] || value}
                          </span>
                        )}
                      />
                      <Line
                        type="monotone"
                        dataKey={`${selectedModel}_hi_90`}
                        stroke={colors.high}
                        strokeDasharray="3 3"
                        dot={false}
                        name="90% Confidence (High)"
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
                      <Line
                        type="monotone"
                        dataKey={`${selectedModel}_lo_90`}
                        stroke={colors.low}
                        strokeDasharray="3 3"
                        dot={false}
                        name="90% Confidence (Low)"
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
                    <LineChart data={filteredMlChartData}>
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
                        formatter={(value) => (
                          <span style={{ color: colors.text }}>
                            {t[value as keyof typeof t] || value}
                          </span>
                        )}
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
                        name={t.elasticnet}
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
                        name={t.lightgbm}
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
                        name={t.xgboost}
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
                        name={t.catboost}
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
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
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
            <div className="h-2 overflow-hidden rounded-full bg-muted/20">
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
