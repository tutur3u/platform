'use client';

import { useQuery } from '@tanstack/react-query';
import {
  type FinanceDailyIncomeExpensePoint,
  type FinanceMonthlyIncomeExpensePoint,
  listFinanceDailyIncomeExpense,
  listFinanceMonthlyIncomeExpense,
} from '@tuturuuu/internal-api/finance';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useAnalyticsFilters } from '../../../../hooks/use-analytics-filters';
import { Card, CardContent, CardHeader, CardTitle } from '../../card';
import { Skeleton } from '../../skeleton';
import { CategoryBreakdownChart } from '../shared/charts/category-breakdown-chart';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../shared/use-finance-confidential-visibility';
import { AnalyticsDateControls } from './analytics-date-controls';
import { BalanceTrendChart } from './balance-trend-chart';
import { IncomeExpenseChart } from './income-expense-chart';

interface AnalyticsPageProps {
  wsId: string;
  currency?: string;
}

export default function AnalyticsPage({
  wsId,
  currency = 'USD',
}: AnalyticsPageProps) {
  const t = useTranslations('finance-analytics');
  const filters = useAnalyticsFilters({ preset: '30d' });

  const {
    data: dailyData = [],
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
    queryFn: () =>
      listFinanceDailyIncomeExpense(wsId, {
        endDate: filters.apiDateRange.endDate,
        includeConfidential: filters.includeConfidential,
        startDate: filters.apiDateRange.startDate,
      }),
    staleTime: 30_000,
  });

  const {
    data: monthlyData = [],
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
    queryFn: () =>
      listFinanceMonthlyIncomeExpense(wsId, {
        endDate: filters.apiDateRange.endDate,
        includeConfidential: filters.includeConfidential,
        startDate: filters.apiDateRange.startDate,
      }),
    staleTime: 30_000,
  });

  const showDailyChart =
    filters.interval === 'daily' || filters.interval === 'weekly';
  const presetDisplayLabels = {
    '7d': t('last-7-days'),
    '30d': t('last-30-days'),
    'this-month': t('this-month'),
    'last-month': t('last-month'),
    'this-quarter': t('this-quarter'),
    'this-year': t('this-year'),
    all: t('all-time'),
  } satisfies Record<typeof filters.preset, string>;
  const displayRange =
    filters.preset === 'all'
      ? filters.displayRange === 'All time'
        ? t('all-time')
        : filters.displayRange
      : presetDisplayLabels[filters.preset];

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
        displayRange={displayRange}
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
  dailyData: FinanceDailyIncomeExpensePoint[];
  monthlyData: FinanceMonthlyIncomeExpensePoint[];
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
  const { isConfidential: areNumbersHidden } =
    useFinanceConfidentialVisibility();
  const locale = currency === 'VND' ? 'vi-VN' : 'en-US';
  const shouldHideAmounts = areNumbersHidden || !includeConfidential;

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
            {error.message || t('failed-to-load-data')}
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
            {t('total-income')}
          </span>
          <span className="font-semibold text-dynamic-green">
            {shouldHideAmounts
              ? FINANCE_HIDDEN_AMOUNT
              : formatValue(totalDailyIncome)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">
            {t('total-expense')}
          </span>
          <span className="font-semibold text-dynamic-red">
            {shouldHideAmounts
              ? FINANCE_HIDDEN_AMOUNT
              : formatValue(totalDailyExpense)}
          </span>
        </div>
        <div className="border-t pt-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              {t('net-total')}
            </span>
            <span
              className={cn(
                'font-semibold',
                shouldHideAmounts
                  ? 'text-muted-foreground'
                  : netTotal >= 0
                    ? 'text-dynamic-green'
                    : 'text-dynamic-red'
              )}
            >
              {shouldHideAmounts
                ? FINANCE_HIDDEN_AMOUNT
                : formatValue(netTotal)}
            </span>
          </div>
        </div>
        <div className="border-t pt-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              {t('daily-avg-income')}
            </span>
            <span className="font-medium text-sm">
              {shouldHideAmounts
                ? FINANCE_HIDDEN_AMOUNT
                : formatValue(dailyAvgIncome)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              {t('daily-avg-expense')}
            </span>
            <span className="font-medium text-sm">
              {shouldHideAmounts
                ? FINANCE_HIDDEN_AMOUNT
                : formatValue(dailyAvgExpense)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
