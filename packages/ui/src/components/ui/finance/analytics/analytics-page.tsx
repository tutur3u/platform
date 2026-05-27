'use client';

import { useQuery } from '@tanstack/react-query';
import {
  type FinanceIncomeExpenseSummary,
  listFinanceIncomeExpenseSummary,
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
  const summaryInterval = filters.interval === 'monthly' ? 'monthly' : 'daily';

  const {
    data: incomeExpenseSummary,
    isLoading: isSummaryLoading,
    error: summaryError,
  } = useQuery({
    queryKey: [
      'analytics-income-expense-summary',
      wsId,
      summaryInterval,
      filters.apiDateRange.startDate,
      filters.apiDateRange.endDate,
      filters.includeConfidential,
    ],
    queryFn: () =>
      listFinanceIncomeExpenseSummary(wsId, {
        endDate: filters.apiDateRange.endDate,
        includeConfidential: filters.includeConfidential,
        interval: summaryInterval,
        startDate: filters.apiDateRange.startDate,
      }),
    staleTime: 30_000,
  });

  const showDailyChart =
    filters.interval === 'daily' || filters.interval === 'weekly';
  const incomeExpenseChartData = (incomeExpenseSummary?.data ?? []).map(
    (item) => ({
      day: item.period,
      total_expense: item.total_expense,
      total_income: item.total_income,
    })
  );
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
            data={incomeExpenseChartData}
            isLoading={isSummaryLoading}
            error={summaryError}
            currency={currency}
            title={t('income-vs-expense')}
            interval={filters.interval}
            includeConfidential={filters.includeConfidential}
          />
        ) : (
          <IncomeExpenseChart
            data={incomeExpenseChartData}
            isLoading={isSummaryLoading}
            error={summaryError}
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
          summary={incomeExpenseSummary}
          isLoading={isSummaryLoading}
          error={summaryError}
          currency={currency}
          includeConfidential={filters.includeConfidential}
        />
      </div>
    </div>
  );
}

interface SpendingTrendsSummaryProps {
  summary?: FinanceIncomeExpenseSummary;
  isLoading: boolean;
  error?: Error | null;
  currency: string;
  includeConfidential: boolean;
}

function SpendingTrendsSummary({
  summary,
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

  const totalIncome = summary?.total_income ?? 0;
  const totalExpense = summary?.total_expense ?? 0;
  const averageIncome = summary?.average_income ?? 0;
  const averageExpense = summary?.average_expense ?? 0;
  const netTotal = summary?.net_total ?? 0;

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
              : formatValue(totalIncome)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">
            {t('total-expense')}
          </span>
          <span className="font-semibold text-dynamic-red">
            {shouldHideAmounts
              ? FINANCE_HIDDEN_AMOUNT
              : formatValue(totalExpense)}
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
                : formatValue(averageIncome)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              {t('daily-avg-expense')}
            </span>
            <span className="font-medium text-sm">
              {shouldHideAmounts
                ? FINANCE_HIDDEN_AMOUNT
                : formatValue(averageExpense)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
