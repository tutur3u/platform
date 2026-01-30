'use client';

import { useTranslations } from 'next-intl';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '../../card';
import {
  InvoiceTotalsChart,
  type InvoiceTotalsChartProps,
  InvoiceTotalsChartSkeleton,
} from './charts/invoice-totals-chart';
import { useInvoiceAnalytics } from './hooks/use-invoice-analytics';

/**
 * weekStartsOn values (JavaScript convention, matching useCalendarPreferences):
 *   0 = Sunday
 *   1 = Monday (default)
 *   6 = Saturday
 */
type WeekStartsOn = 0 | 1 | 6;

interface InvoiceAnalyticsProps {
  wsId: string;
  className?: string;
  /**
   * First day of week preference (0=Sunday, 1=Monday, 6=Saturday)
   * Used for weekly grouping calculations
   * @default 1 (Monday)
   */
  weekStartsOn?: WeekStartsOn;
  currency?: string;
}

export function InvoiceAnalytics({
  wsId,
  className,
  weekStartsOn = 1,
  currency: _currency = 'USD',
}: InvoiceAnalyticsProps) {
  const t = useTranslations('invoice-analytics');

  // Use nuqs for URL state management (shallow: true for client-side only)
  const [start] = useQueryState(
    'start',
    parseAsString.withOptions({ shallow: true })
  );
  const [end] = useQueryState(
    'end',
    parseAsString.withOptions({ shallow: true })
  );
  const [userIds] = useQueryState(
    'userIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({ shallow: true })
  );
  const [walletIds] = useQueryState(
    'walletIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({ shallow: true })
  );
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  // Build filters object
  const filters = useMemo(
    () => ({
      walletIds: walletIds.length > 0 ? walletIds : undefined,
      userIds: userIds.length > 0 ? userIds : undefined,
      startDate: start || undefined,
      endDate: end || undefined,
      granularity: start && end ? period : undefined,
    }),
    [walletIds, userIds, start, end, period]
  );

  // Fetch analytics data with React Query
  const {
    walletData,
    creatorData,
    dailyWalletData,
    weeklyWalletData,
    monthlyWalletData,
    dailyCreatorData,
    weeklyCreatorData,
    monthlyCreatorData,
    hasDateRange,
    startDate,
    endDate,
    isLoading,
    error,
  } = useInvoiceAnalytics(wsId, filters, weekStartsOn);

  const inferredPeriod = useMemo((): 'daily' | 'weekly' | 'monthly' => {
    // Use URL params (start/end) for initial calculation, not API response (startDate/endDate)
    if (!start || !end) return 'daily';
    const startValue = new Date(start);
    const endValue = new Date(end);
    const dayCount = Math.ceil(
      (endValue.getTime() - startValue.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (dayCount <= 31) return 'daily';
    if (dayCount <= 90) return 'weekly';
    return 'monthly';
  }, [start, end]);

  // Set period to inferred value when date range changes
  useEffect(() => {
    if (start && end) {
      setPeriod(inferredPeriod);
    }
  }, [start, end, inferredPeriod]);

  const handlePeriodChange = (nextPeriod: 'daily' | 'weekly' | 'monthly') => {
    setPeriod(nextPeriod);
  };

  // Handle loading state
  if (isLoading) {
    return <InvoiceTotalsChartSkeleton className={className} />;
  }

  // Handle error state
  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex h-70 items-center justify-center">
          <p className="text-destructive text-sm">{t('error_loading')}</p>
        </CardContent>
      </Card>
    );
  }

  const fallbackEndDate = new Date().toISOString().slice(0, 10);
  const fallbackStartDate = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const resolvedStartDate = startDate ?? start ?? fallbackStartDate;
  const resolvedEndDate = endDate ?? end ?? fallbackEndDate;

  // Build chart props based on data mode
  const chartProps: InvoiceTotalsChartProps = hasDateRange
    ? {
        walletData: walletData || [],
        creatorData: creatorData || [],
        hasDateRange: true,
        startDate: resolvedStartDate,
        endDate: resolvedEndDate,
        period,
        setPeriod: handlePeriodChange,
        className,
        showPeriodTabs: true, // Always show period tabs
      }
    : {
        dailyWalletData: dailyWalletData || [],
        weeklyWalletData: weeklyWalletData || [],
        monthlyWalletData: monthlyWalletData || [],
        dailyCreatorData: dailyCreatorData || [],
        weeklyCreatorData: weeklyCreatorData || [],
        monthlyCreatorData: monthlyCreatorData || [],
        hasDateRange: false,
        period,
        setPeriod: handlePeriodChange,
        className,
        showPeriodTabs: true,
      };

  return <InvoiceTotalsChart {...chartProps} />;
}
