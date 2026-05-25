'use client';

import { useQuery } from '@tanstack/react-query';
import { listFinanceCategoryBreakdown } from '@tuturuuu/internal-api/finance';
import { cn, getCurrencyLocale } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import type { LegendPayload } from 'recharts';
import { Card, CardContent, CardHeader } from '../../../card';
import type { ChartConfig } from '../../../chart';
import { Skeleton } from '../../../skeleton';
import { CategoryBreakdownChartBody } from './category-breakdown-chart-body';
import { CategoryBreakdownChartControls } from './category-breakdown-chart-controls';
import type {
  ChartInterval,
  TransactionType,
} from './category-breakdown-chart-types';
import {
  buildCategoryBreakdownChartData,
  getActualCategoryBreakdownDisplayRange,
  getCategoryBreakdownDateRange,
} from './category-breakdown-chart-utils';
import {
  FINANCE_HIDDEN_AMOUNT,
  FINANCE_HIDDEN_COMPACT_AMOUNT,
  useFinanceConfidentialVisibility,
} from './use-finance-confidential-visibility';

interface CategoryBreakdownChartProps {
  wsId: string;
  currency?: string;
  className?: string;
  includeConfidential?: boolean;
  /** Default transaction type to show. Defaults to 'expense' */
  defaultTransactionType?: TransactionType;
}

export function CategoryBreakdownChart({
  wsId,
  currency = 'USD',
  className,
  includeConfidential = true,
  defaultTransactionType = 'expense',
}: CategoryBreakdownChartProps) {
  const locale = useLocale();
  const t = useTranslations();
  const { isConfidential, toggleConfidential } =
    useFinanceConfidentialVisibility();
  const shouldHideAmounts = isConfidential || !includeConfidential;
  const [dateOffset, setDateOffset] = useState(0);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(
    new Set()
  );
  const [transactionType, setTransactionType] = useState<TransactionType>(
    defaultTransactionType
  );
  const [interval, setInterval] = useState<ChartInterval>('monthly');

  const dateRange = useMemo(
    () => getCategoryBreakdownDateRange(interval, dateOffset, locale),
    [dateOffset, interval, locale]
  );
  const anchorToLatest = dateOffset === 0;

  const {
    data: rawData = [],
    error,
    isLoading,
  } = useQuery({
    queryKey: [
      'category-breakdown',
      wsId,
      anchorToLatest ? 'latest' : dateRange.startDate,
      anchorToLatest ? 'latest' : dateRange.endDate,
      includeConfidential,
      transactionType,
      interval,
    ],
    queryFn: () =>
      listFinanceCategoryBreakdown(wsId, {
        anchorToLatest,
        endDate: anchorToLatest ? undefined : dateRange.endDate,
        includeConfidential,
        interval,
        startDate: anchorToLatest ? undefined : dateRange.startDate,
        transactionType,
      }),
  });

  const actualDisplayRange = useMemo(
    () =>
      getActualCategoryBreakdownDisplayRange(
        anchorToLatest,
        rawData,
        {
          displayEnd: dateRange.displayEnd,
          displayStart: dateRange.displayStart,
        },
        interval,
        locale
      ),
    [
      anchorToLatest,
      dateRange.displayEnd,
      dateRange.displayStart,
      interval,
      locale,
      rawData,
    ]
  );

  const { chartData, categories } = useMemo(
    () => buildCategoryBreakdownChartData(rawData),
    [rawData]
  );

  const intervalLabels: Record<ChartInterval, string> = useMemo(
    () => ({
      daily: t('finance-analytics.daily'),
      weekly: t('finance-analytics.weekly'),
      monthly: t('finance-analytics.monthly'),
      yearly: t('finance-analytics.yearly'),
    }),
    [t]
  );

  const chartTitle = useMemo(() => {
    if (transactionType === 'income') {
      return t('finance-overview.income-by-category');
    }
    return t('finance-overview.spending-by-category');
  }, [transactionType, t]);

  const chartConfig = useMemo<ChartConfig>(() => {
    return categories.reduce((config, category) => {
      config[category.name] = {
        label: category.name,
        color: category.color,
      };
      return config;
    }, {} as ChartConfig);
  }, [categories]);

  const formatValue = useCallback(
    (value: number) => {
      if (shouldHideAmounts) return FINANCE_HIDDEN_AMOUNT;
      return new Intl.NumberFormat(getCurrencyLocale(currency), {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    },
    [shouldHideAmounts, currency]
  );

  const formatCompactValue = useCallback(
    (value: number) => {
      if (shouldHideAmounts) return FINANCE_HIDDEN_COMPACT_AMOUNT;
      return new Intl.NumberFormat(locale, {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
      }).format(value);
    },
    [shouldHideAmounts, locale]
  );

  const handleLegendClick = useCallback((entry: LegendPayload) => {
    const categoryName = entry.value as string;
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryName)) {
        next.delete(categoryName);
      } else {
        next.add(categoryName);
      }
      return next;
    });
  }, []);

  const handleIntervalChange = useCallback((nextInterval: ChartInterval) => {
    setInterval(nextInterval);
    setDateOffset(0);
  }, []);

  const handleTransactionTypeChange = useCallback(
    (nextTransactionType: TransactionType) => {
      setTransactionType(nextTransactionType);
      setHiddenCategories(new Set());
    },
    []
  );

  const renderCard = (content: ReactNode) => (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader>
        <CategoryBreakdownChartControls
          chartTitle={chartTitle}
          dateOffset={dateOffset}
          displayRange={actualDisplayRange}
          interval={interval}
          intervalLabels={intervalLabels}
          isConfidential={isConfidential}
          onIntervalChange={handleIntervalChange}
          onNextPeriod={() => setDateOffset((d) => Math.max(0, d - 1))}
          onPreviousPeriod={() => setDateOffset((d) => d + 1)}
          onToggleConfidential={toggleConfidential}
          onTransactionTypeChange={handleTransactionTypeChange}
          showRangeControls={!isLoading && !error && rawData.length > 0}
          transactionType={transactionType}
        />
      </CardHeader>
      {content}
    </Card>
  );

  if (isLoading) {
    return renderCard(
      <CardContent className="flex h-80 items-center justify-center">
        <Skeleton className="h-full w-full" />
      </CardContent>
    );
  }

  if (error) {
    return renderCard(
      <CardContent className="flex h-75 items-center justify-center">
        <p className="text-muted-foreground text-sm">
          {error instanceof Error
            ? error.message
            : t('finance-analytics.failed-to-load-data')}
        </p>
      </CardContent>
    );
  }

  if (rawData.length === 0) {
    return renderCard(
      <CardContent className="flex h-75 items-center justify-center">
        <p className="text-muted-foreground text-sm">
          {t('finance-analytics.no-data')}
        </p>
      </CardContent>
    );
  }

  return renderCard(
    <CardContent className="px-2 pb-4">
      <CategoryBreakdownChartBody
        categories={categories}
        chartConfig={chartConfig}
        chartData={chartData}
        formatCompactValue={formatCompactValue}
        formatValue={formatValue}
        hiddenCategories={hiddenCategories}
        interval={interval}
        locale={locale}
        onToggleCategory={handleLegendClick}
      />
    </CardContent>
  );
}
