'use client';

import { useQuery } from '@tanstack/react-query';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useAnalyticsFilters } from '../../../../hooks/use-analytics-filters';
import { Card, CardContent, CardHeader, CardTitle } from '../../card';
import { Skeleton } from '../../skeleton';
import { CategoryBreakdownChart } from '../shared/charts/category-breakdown-chart';
import { AnalyticsDateControls } from './analytics-date-controls';
import { BalanceTrendChart } from './balance-trend-chart';
import { IncomeExpenseChart } from './income-expense-chart';

interface AnalyticsPageProps {
  wsId: string;
  currency?: string;
}

interface DailyData {
  day: string;
  total_income: number;
  total_expense: number;
}

interface MonthlyData {
  month: string;
  total_income: number;
  total_expense: number;
}

export default function AnalyticsPage({
  wsId,
  currency = 'USD',
}: AnalyticsPageProps) {
  const t = useTranslations('finance-analytics');
  const filters = useAnalyticsFilters({ preset: '30d' });

  // Fetch daily data
  const {
    data: dailyResponse,
    isLoading: isDailyLoading,
    error: dailyError,
  } = useQuery({
    queryKey: [
      'analytics-daily',
      wsId,
      filters.apiDateRange.startDate,
      filters.apiDateRange.endDate,
      filters.includeConfidential,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.apiDateRange.startDate) {
        params.set('startDate', filters.apiDateRange.startDate);
      }
      if (filters.apiDateRange.endDate) {
        params.set('endDate', filters.apiDateRange.endDate);
      }
      params.set('includeConfidential', String(filters.includeConfidential));

      const res = await fetch(
        `/api/workspaces/${wsId}/finance/charts/daily?${params}`
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch daily data');
      }
      return res.json();
    },
    staleTime: 30_000,
  });

  // Fetch monthly data
  const {
    data: monthlyResponse,
    isLoading: isMonthlyLoading,
    error: monthlyError,
  } = useQuery({
    queryKey: [
      'analytics-monthly',
      wsId,
      filters.apiDateRange.startDate,
      filters.apiDateRange.endDate,
      filters.includeConfidential,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.apiDateRange.startDate) {
        params.set('startDate', filters.apiDateRange.startDate);
      }
      if (filters.apiDateRange.endDate) {
        params.set('endDate', filters.apiDateRange.endDate);
      }
      params.set('includeConfidential', String(filters.includeConfidential));

      const res = await fetch(
        `/api/workspaces/${wsId}/finance/charts/monthly?${params}`
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch monthly data');
      }
      return res.json();
    },
    staleTime: 30_000,
  });

  const dailyData: DailyData[] = dailyResponse?.data || [];
  const monthlyData: MonthlyData[] = monthlyResponse?.data || [];

  // Determine which chart to show based on interval
  const showDailyChart =
    filters.interval === 'daily' || filters.interval === 'weekly';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-bold text-2xl">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </div>

      {/* Date Controls */}
      <AnalyticsDateControls
        preset={filters.preset}
        interval={filters.interval}
        includeConfidential={filters.includeConfidential}
        onPresetChange={filters.setPreset}
        onIntervalChange={filters.setInterval}
        onConfidentialToggle={filters.toggleConfidential}
        displayRange={filters.displayRange}
        className="rounded-lg border bg-card p-4"
      />

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Income vs Expense Chart */}
        {showDailyChart ? (
          <IncomeExpenseChart
            data={dailyData}
            isLoading={isDailyLoading}
            error={dailyError}
            currency={currency}
            title={t('income-vs-expense')}
            interval={filters.interval}
            includeConfidential={filters.includeConfidential}
          />
        ) : (
          <IncomeExpenseChart
            data={monthlyData.map((item) => ({
              day: item.month,
              total_income: item.total_income,
              total_expense: item.total_expense,
            }))}
            isLoading={isMonthlyLoading}
            error={monthlyError}
            currency={currency}
            title={t('income-vs-expense')}
            interval={filters.interval}
            includeConfidential={filters.includeConfidential}
          />
        )}

        {/* Category Breakdown Chart */}
        <CategoryBreakdownChart
          wsId={wsId}
          currency={currency}
          includeConfidential={filters.includeConfidential}
        />

        {/* Balance Trend Chart */}
        <BalanceTrendChart
          wsId={wsId}
          currency={currency}
          startDate={filters.apiDateRange.startDate}
          endDate={filters.apiDateRange.endDate}
          includeConfidential={filters.includeConfidential}
          title={t('balance-trend')}
        />

        {/* Spending Trends Summary Card */}
        <SpendingTrendsSummary
          dailyData={dailyData}
          monthlyData={monthlyData}
          isLoading={isDailyLoading || isMonthlyLoading}
          error={dailyError || monthlyError}
          currency={currency}
          includeConfidential={filters.includeConfidential}
        />
      </div>
    </div>
  );
}

interface SpendingTrendsSummaryProps {
  dailyData: DailyData[];
  monthlyData: MonthlyData[];
  isLoading: boolean;
  error?: Error | null;
  currency: string;
  includeConfidential: boolean;
}

function SpendingTrendsSummary({
  dailyData,
  // monthlyData is available for future use (e.g., monthly comparisons)
  monthlyData: _monthlyData,
  isLoading,
  error,
  currency,
  includeConfidential,
}: SpendingTrendsSummaryProps) {
  const t = useTranslations('finance-analytics');
  const locale = currency === 'VND' ? 'vi-VN' : 'en-US';

  const formatValue = (value: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Calculate summary statistics
  const totalDailyIncome = dailyData.reduce(
    (sum, d) => sum + (d.total_income || 0),
    0
  );
  const totalDailyExpense = dailyData.reduce(
    (sum, d) => sum + (d.total_expense || 0),
    0
  );
  const dailyAvgIncome =
    dailyData.length > 0 ? totalDailyIncome / dailyData.length : 0;
  const dailyAvgExpense =
    dailyData.length > 0 ? totalDailyExpense / dailyData.length : 0;
  const netTotal = totalDailyIncome - totalDailyExpense;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('spending-trends')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('spending-trends')}</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[200px] items-center justify-center">
          <p className="text-muted-foreground text-sm">
            {error.message || 'Failed to load data'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('spending-trends')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">
            {t('total-income') ?? 'Total Income'}
          </span>
          <span className="font-semibold text-green-600 dark:text-green-400">
            {includeConfidential ? formatValue(totalDailyIncome) : '•••••'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">
            {t('total-expense') ?? 'Total Expense'}
          </span>
          <span className="font-semibold text-red-600 dark:text-red-400">
            {includeConfidential ? formatValue(totalDailyExpense) : '•••••'}
          </span>
        </div>
        <div className="border-t pt-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              {t('net-total') ?? 'Net Total'}
            </span>
            <span
              className={cn(
                'font-semibold',
                netTotal >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              )}
            >
              {includeConfidential ? formatValue(netTotal) : '•••••'}
            </span>
          </div>
        </div>
        <div className="border-t pt-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              {t('daily-avg-income') ?? 'Daily Avg Income'}
            </span>
            <span className="font-medium text-sm">
              {includeConfidential ? formatValue(dailyAvgIncome) : '•••••'}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              {t('daily-avg-expense') ?? 'Daily Avg Expense'}
            </span>
            <span className="font-medium text-sm">
              {includeConfidential ? formatValue(dailyAvgExpense) : '•••••'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
