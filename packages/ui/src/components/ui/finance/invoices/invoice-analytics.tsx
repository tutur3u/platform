'use client';

import { X } from '@tuturuuu/icons';
import { useLocale, useTranslations } from 'next-intl';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useMemo } from 'react';
import { Badge } from '../../badge';
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
}

export function InvoiceAnalytics({
  wsId,
  className,
  weekStartsOn = 1,
}: InvoiceAnalyticsProps) {
  const t = useTranslations('invoice-analytics');
  const locale = useLocale();

  // Use nuqs for URL state management (shallow: true for client-side only)
  const [start, setStart] = useQueryState(
    'start',
    parseAsString.withOptions({ shallow: true })
  );
  const [end, setEnd] = useQueryState(
    'end',
    parseAsString.withOptions({ shallow: true })
  );
  const [userIds, setUserIds] = useQueryState(
    'userIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({ shallow: true })
  );
  const [walletIds, setWalletIds] = useQueryState(
    'walletIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({ shallow: true })
  );

  // Build filters object
  const filters = useMemo(
    () => ({
      walletIds: walletIds.length > 0 ? walletIds : undefined,
      userIds: userIds.length > 0 ? userIds : undefined,
      startDate: start || undefined,
      endDate: end || undefined,
    }),
    [walletIds, userIds, start, end]
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

  // Handle loading state
  if (isLoading) {
    return <InvoiceTotalsChartSkeleton className={className} />;
  }

  // Handle error state
  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex h-[280px] items-center justify-center">
          <p className="text-destructive text-sm">{t('error_loading')}</p>
        </CardContent>
      </Card>
    );
  }

  // Build chart props based on data mode
  const chartProps: InvoiceTotalsChartProps = hasDateRange
    ? {
        walletData: walletData || [],
        creatorData: creatorData || [],
        hasDateRange: true,
        startDate: startDate!,
        endDate: endDate!,
        className,
      }
    : {
        dailyWalletData: dailyWalletData || [],
        weeklyWalletData: weeklyWalletData || [],
        monthlyWalletData: monthlyWalletData || [],
        dailyCreatorData: dailyCreatorData || [],
        weeklyCreatorData: weeklyCreatorData || [],
        monthlyCreatorData: monthlyCreatorData || [],
        hasDateRange: false,
        className,
      };

  // Check if any filters are active
  const hasActiveFilters = !!(
    start ||
    userIds.length > 0 ||
    walletIds.length > 0
  );

  // Clear all filters handler
  const handleClearAll = () => {
    setStart(null);
    setEnd(null);
    setUserIds(null);
    setWalletIds(null);
  };

  // Format date for display
  const formatDate = (dateString: string, includeYear = false) => {
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        ...(includeYear && { year: 'numeric' }),
      }).format(date);
    } catch {
      return dateString;
    }
  };

  return (
    <>
      {/* Active filters display - only show when filters are active */}
      {hasActiveFilters && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {start && end && (
            <Badge variant="secondary" className="gap-1.5">
              {formatDate(start)} – {formatDate(end, true)}
              <button
                type="button"
                onClick={() => {
                  setStart(null);
                  setEnd(null);
                }}
                className="ml-0.5 rounded-full hover:bg-secondary-foreground/20"
                aria-label={t('clear_filter')}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {userIds.length > 0 && (
            <Badge variant="secondary" className="gap-1.5">
              {t('users_filter')}: {userIds.length}
              <button
                type="button"
                onClick={() => setUserIds(null)}
                className="ml-0.5 rounded-full hover:bg-secondary-foreground/20"
                aria-label={t('clear_filter')}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {walletIds.length > 0 && (
            <Badge variant="secondary" className="gap-1.5">
              {t('wallets_filter')}: {walletIds.length}
              <button
                type="button"
                onClick={() => setWalletIds(null)}
                className="ml-0.5 rounded-full hover:bg-secondary-foreground/20"
                aria-label={t('clear_filter')}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <button
            type="button"
            onClick={handleClearAll}
            className="text-muted-foreground text-xs underline hover:text-foreground"
          >
            {t('clear_all_filters')}
          </button>
        </div>
      )}

      {/* Chart component */}
      <InvoiceTotalsChart {...chartProps} />
    </>
  );
}
