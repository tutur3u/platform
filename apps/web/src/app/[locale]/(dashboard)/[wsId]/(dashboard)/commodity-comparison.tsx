'use client';

import { fetchAuroraForecast } from '@/lib/aurora';
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
import { AlertCircle } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
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
    primary: '#3b82f6', // Blue 500
    success: '#22c55e', // Green 500
    warning: '#f59e0b', // Amber 500
    info: '#06b6d4', // Cyan 500
    grid: '#e5e7eb', // Gray 200
    axis: '#4b5563', // Gray 600
    text: '#1f2937', // Gray 800
    muted: '#6b7280', // Gray 500
    tooltip: {
      bg: '#ffffff',
      border: '#e5e7eb',
      text: '#1f2937',
    },
  },
  dark: {
    primary: '#60a5fa', // Blue 400
    success: '#4ade80', // Green 400
    warning: '#fbbf24', // Amber 400
    info: '#22d3ee', // Cyan 400
    grid: '#374151', // Gray 700
    axis: '#9ca3af', // Gray 400
    text: '#f3f4f6', // Gray 100
    muted: '#9ca3af', // Gray 400
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

const CommodityComparison = () => {
  const { resolvedTheme } = useTheme();
  const colors = resolvedTheme === 'dark' ? COLORS.dark : COLORS.light;
  const [selectedDate, setSelectedDate] = useState('');
  const [data, setData] = useState<any[]>([]);
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
        const transformedData = response.statistical_forecast.map(
          (item: any) => ({
            date: item.date,
            displayDate: formatDate(item.date),
            auto_arima: parseFloat(item.auto_arima || '0'),
            auto_ets: parseFloat(item.auto_ets || '0'),
            auto_theta: parseFloat(item.auto_theta || '0'),
            ces: parseFloat(item.ces || '0'),
          })
        );

        setData(transformedData);
        if (transformedData.length > 0) {
          setSelectedDate(transformedData[transformedData.length - 1]?.date);
        }
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
      modelComparison: 'Statistical Model Comparison',
      selectDate: 'Select Date:',
      price: 'Price (USD/ton)',
      auto_arima: 'AutoARIMA',
      auto_ets: 'AutoETS',
      auto_theta: 'AutoTheta',
      ces: 'CES',
      error: 'Error',
      tryAgain: 'Try Again',
      loading: 'Loading comparison data...',
      noData: 'No data available for the selected date',
      insights: 'Model Insights',
      priceRange: 'Price Range',
      priceVolatility: 'Price Volatility',
      modelCorrelation: 'Model Correlation',
      timeRange: 'Time Range',
      all: 'All Time',
      last30Days: 'Last 30 Days',
      last7Days: 'Last 7 Days',
      custom: 'Custom',
      high: 'High',
      low: 'Low',
      average: 'Average',
      correlation: 'Correlation',
      strong: 'Strong',
      moderate: 'Moderate',
      weak: 'Weak',
    },
    vi: {
      modelComparison: 'So sánh mặt hàng',
      selectDate: 'Chọn ngày:',
      price: 'Giá (USD/tấn)',
      auto_arima: 'Gạo',
      auto_ets: 'Lúa mì',
      auto_theta: 'Ngô',
    },
  };

  const t = translations['en'];

  // Filter data based on date range
  const filteredData = dateRange
    ? data.filter((d) => {
        const date = new Date(d.date);
        return date >= dateRange[0] && date <= dateRange[1];
      })
    : data;

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

    // Calculate support and resistance levels
    const { support, resistance } = calculateSupportResistance(values);

    return {
      high,
      low,
      average: avg,
      volatility,
      trendSlope,
      momentum,
      support,
      resistance,
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

  const calculateSupportResistance = (values: number[]) => {
    const sortedValues = [...values].sort((a, b) => a - b);
    const q1Index = Math.floor(sortedValues.length * 0.25);
    const q3Index = Math.floor(sortedValues.length * 0.75);

    return {
      support: sortedValues[q1Index],
      resistance: sortedValues[q3Index],
    };
  };

  const calculateCorrelation = (x: number[], y: number[]) => {
    if (!x.length || !y.length || x.length !== y.length) return 0;

    const n = x.length;
    const sum_x = x.reduce((a, b) => a + b, 0);
    const sum_y = y.reduce((a, b) => a + b, 0);
    const sum_xy = x.reduce((a, b, i) => a + b * (y[i] || 0), 0);
    const sum_x2 = x.reduce((a, b) => a + b * b, 0);
    const sum_y2 = y.reduce((a, b) => a + b * b, 0);

    const numerator = n * sum_xy - sum_x * sum_y;
    const denominator = Math.sqrt(
      (n * sum_x2 - sum_x * sum_x) * (n * sum_y2 - sum_y * sum_y)
    );

    return denominator === 0 ? 0 : numerator / denominator;
  };

  const getCorrelationStrength = (correlation: number) => {
    const abs = Math.abs(correlation);
    if (abs >= 0.7) return t.strong;
    if (abs >= 0.3) return t.moderate;
    return t.weak;
  };

  const selectedData = filteredData.find((item) => item.date === selectedDate);
  const insights = {
    auto_arima: getModelInsights(filteredData, 'auto_arima'),
    auto_ets: getModelInsights(filteredData, 'auto_ets'),
    auto_theta: getModelInsights(filteredData, 'auto_theta'),
    ces: getModelInsights(filteredData, 'ces'),
  };

  const correlations = filteredData.length
    ? {
        auto_arima_auto_ets: calculateCorrelation(
          filteredData.map((d) => d.auto_arima),
          filteredData.map((d) => d.auto_ets)
        ),
        auto_arima_auto_theta: calculateCorrelation(
          filteredData.map((d) => d.auto_arima),
          filteredData.map((d) => d.auto_theta)
        ),
        auto_arima_ces: calculateCorrelation(
          filteredData.map((d) => d.auto_arima),
          filteredData.map((d) => d.ces)
        ),
      }
    : null;

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
          <CardTitle>{t.modelComparison}</CardTitle>
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

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{t.modelComparison}</CardTitle>
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
        <div className="mb-4">
          <label
            htmlFor="date"
            className="mb-1 block text-sm font-medium text-muted-foreground"
          >
            {t.selectDate}
          </label>
          <Select value={selectedDate} onValueChange={setSelectedDate}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select date" />
            </SelectTrigger>
            <SelectContent>
              {filteredData.map((item) => (
                <SelectItem key={item.date} value={item.date}>
                  {item.displayDate}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedData ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <PriceCard
                title={t.auto_arima}
                value={selectedData.auto_arima}
                color={colors.primary}
                insights={insights.auto_arima}
              />
              <PriceCard
                title={t.auto_ets}
                value={selectedData.auto_ets}
                color={colors.success}
                insights={insights.auto_ets}
              />
              <PriceCard
                title={t.auto_theta}
                value={selectedData.auto_theta}
                color={colors.warning}
                insights={insights.auto_theta}
              />
              <PriceCard
                title={t.ces}
                value={selectedData.ces}
                color={colors.info}
                insights={insights.ces}
              />
            </div>

            {correlations && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {t.modelCorrelation}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="flex flex-col gap-2">
                      <div className="text-sm font-medium">
                        {t.auto_arima} - {t.auto_ets}
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${Math.abs(
                              correlations.auto_arima_auto_ets * 100
                            )}%`,
                            backgroundColor: colors.primary,
                          }}
                        />
                        <span className="text-sm text-muted-foreground">
                          {getCorrelationStrength(
                            correlations.auto_arima_auto_ets
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="text-sm font-medium">
                        {t.auto_arima} - {t.auto_theta}
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${Math.abs(
                              correlations.auto_arima_auto_theta * 100
                            )}%`,
                            backgroundColor: colors.warning,
                          }}
                        />
                        <span className="text-sm text-muted-foreground">
                          {getCorrelationStrength(
                            correlations.auto_arima_auto_theta
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="text-sm font-medium">
                        {t.auto_arima} - {t.ces}
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${Math.abs(
                              correlations.auto_arima_ces * 100
                            )}%`,
                            backgroundColor: colors.info,
                          }}
                        />
                        <span className="text-sm text-muted-foreground">
                          {getCorrelationStrength(correlations.auto_arima_ces)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="pt-6">
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[selectedData]}>
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
                      <Bar
                        dataKey="auto_arima"
                        fill={colors.primary}
                        name={t.auto_arima}
                        animationDuration={300}
                      />
                      <Bar
                        dataKey="auto_ets"
                        fill={colors.success}
                        name={t.auto_ets}
                        animationDuration={300}
                      />
                      <Bar
                        dataKey="auto_theta"
                        fill={colors.warning}
                        name={t.auto_theta}
                        animationDuration={300}
                      />
                      <Bar
                        dataKey="ces"
                        fill={colors.info}
                        name={t.ces}
                        animationDuration={300}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={filteredData}>
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
                        dataKey="auto_arima"
                        stroke={colors.primary}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{
                          r: 6,
                          fill: colors.primary,
                          strokeWidth: 0,
                        }}
                        name={t.auto_arima}
                        animationDuration={300}
                      />
                      <Line
                        type="monotone"
                        dataKey="auto_ets"
                        stroke={colors.success}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{
                          r: 6,
                          fill: colors.success,
                          strokeWidth: 0,
                        }}
                        name={t.auto_ets}
                        animationDuration={300}
                      />
                      <Line
                        type="monotone"
                        dataKey="auto_theta"
                        stroke={colors.warning}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{
                          r: 6,
                          fill: colors.warning,
                          strokeWidth: 0,
                        }}
                        name={t.auto_theta}
                        animationDuration={300}
                      />
                      <Line
                        type="monotone"
                        dataKey="ces"
                        stroke={colors.info}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{
                          r: 6,
                          fill: colors.info,
                          strokeWidth: 0,
                        }}
                        name={t.ces}
                        animationDuration={300}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t.noData}</AlertTitle>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

const PriceCard = ({
  title,
  value,
  color,
  insights,
}: {
  title: string;
  value: number;
  color: string;
  insights: any;
}) => {
  const { resolvedTheme } = useTheme();
  const colors = resolvedTheme === 'dark' ? COLORS.dark : COLORS.light;

  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold" style={{ color }}>
              {formatCurrency(value)}
            </div>
            <p className="text-sm text-muted-foreground">{title}</p>
          </div>
          {insights && insights.trendSlope !== undefined && (
            <div className="flex flex-col items-end">
              <div
                className={`text-lg font-semibold ${
                  insights.trendSlope > 0 ? 'text-success' : 'text-destructive'
                }`}
              >
                {insights.trendSlope > 0 ? '↗' : '↘'}{' '}
                {Math.abs(insights.trendSlope).toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatPercentage(insights.momentum)} momentum
              </div>
            </div>
          )}
        </div>
        {insights && (
          <div className="mt-4 space-y-3 border-t pt-4">
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
                <span className="text-success text-sm font-medium">
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
                <span className="text-sm font-medium text-destructive">
                  {formatCurrency(insights.low)}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Average</span>
              <div className="flex items-center gap-2">
                <div
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${(insights.average / insights.high) * 100}%`,
                    backgroundColor: color,
                  }}
                />
                <span className="text-sm font-medium">
                  {formatCurrency(insights.average)}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Volatility</span>
              <div className="flex items-center gap-2">
                <div
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${(insights.volatility / insights.high) * 100}%`,
                    backgroundColor: colors.info,
                  }}
                />
                <span className="text-sm font-medium">
                  {formatCurrency(insights.volatility)}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CommodityComparison;
