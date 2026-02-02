'use client';

import { TrendingUp } from '@tuturuuu/icons';
import type { InterestProjection } from '@tuturuuu/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';

interface WalletInterestProjectionsProps {
  projections: {
    week: InterestProjection[];
    month: InterestProjection[];
    quarter: InterestProjection[];
    year: InterestProjection[];
  };
  currency: string;
  currentBalance: number;
  /** When true, renders without wrapper (for embedding in parent) */
  embedded?: boolean;
}

/**
 * Projections component showing future interest earnings with different time ranges.
 */
export function WalletInterestProjections({
  projections,
  currency,
  currentBalance,
  embedded = false,
}: WalletInterestProjectionsProps) {
  const t = useTranslations('wallet-interest');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : 'en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat(currency === 'VND' ? 'vi-VN' : 'en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  const calculateSummary = (data: InterestProjection[]) => {
    if (data.length === 0)
      return {
        totalInterest: 0,
        finalBalance: currentBalance,
        growth: 0,
        hasData: false,
      };

    const lastDay = data[data.length - 1];
    const totalInterest = lastDay?.projectedCumulativeInterest ?? 0;
    const finalBalance = lastDay?.projectedBalance ?? currentBalance;
    const growth =
      currentBalance > 0
        ? ((finalBalance - currentBalance) / currentBalance) * 100
        : 0;

    // Check if there's meaningful data (non-zero interest)
    const hasData = totalInterest > 0 || finalBalance !== currentBalance;

    return { totalInterest, finalBalance, growth, hasData };
  };

  const content = (
    <Tabs defaultValue="month">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="week">{t('7_days')}</TabsTrigger>
        <TabsTrigger value="month">{t('30_days')}</TabsTrigger>
        <TabsTrigger value="quarter">{t('90_days')}</TabsTrigger>
        <TabsTrigger value="year">{t('365_days')}</TabsTrigger>
      </TabsList>

      {(['week', 'month', 'quarter', 'year'] as const).map((period) => {
        const data = projections[period];
        const summary = calculateSummary(data);

        return (
          <TabsContent key={period} value={period} className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/50 p-4">
              <div className="text-center">
                <p className="text-muted-foreground text-xs">
                  {t('projected_interest')}
                </p>
                <p className="font-bold text-lg text-primary">
                  +{formatCurrency(summary.totalInterest)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground text-xs">
                  {t('final_balance')}
                </p>
                <p className="font-bold text-lg">
                  {formatCurrency(summary.finalBalance)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground text-xs">{t('growth')}</p>
                <p className="font-bold text-green-600 text-lg">
                  +{summary.growth.toFixed(4)}%
                </p>
              </div>
            </div>

            {/* Simple Chart - only show if there's meaningful data */}
            {summary.hasData && data.length > 1 && (
              <ProjectionChart
                data={data}
                currentBalance={currentBalance}
                formatDate={formatDate}
              />
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );

  if (embedded) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 font-semibold">
          <TrendingUp className="h-4 w-4" />
          {t('projections')}
        </div>
        {content}
      </div>
    );
  }

  return content;
}

function ProjectionChart({
  data,
  currentBalance,
  formatDate,
}: {
  data: InterestProjection[];
  currentBalance: number;
  formatDate: (dateStr: string) => string;
}) {
  if (data.length < 2) return null;

  const minBalance = currentBalance;
  const maxBalance = Math.max(...data.map((d) => d.projectedBalance));
  const range = maxBalance - minBalance;

  // Don't render chart if there's no meaningful range
  if (range === 0) return null;

  // Sample points for display (max 10 points)
  const step = Math.max(1, Math.floor(data.length / 10));
  const sampledData = data.filter(
    (_, i) => i % step === 0 || i === data.length - 1
  );

  return (
    <div className="flex h-32 flex-col">
      {/* Chart Area */}
      <div className="relative flex-1">
        <svg
          className="h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label="Interest projection chart"
        >
          {/* Grid lines */}
          <line
            x1="0"
            y1="25"
            x2="100"
            y2="25"
            stroke="currentColor"
            strokeOpacity="0.1"
          />
          <line
            x1="0"
            y1="50"
            x2="100"
            y2="50"
            stroke="currentColor"
            strokeOpacity="0.1"
          />
          <line
            x1="0"
            y1="75"
            x2="100"
            y2="75"
            stroke="currentColor"
            strokeOpacity="0.1"
          />

          {/* Line path */}
          <path
            d={sampledData
              .map((d, i) => {
                const x = (i / (sampledData.length - 1)) * 100;
                const y =
                  100 - ((d.projectedBalance - minBalance) / range) * 80 - 10;
                return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
              })
              .join(' ')}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />

          {/* Area fill */}
          <path
            d={`
              M 0 100
              ${sampledData
                .map((d, i) => {
                  const x = (i / (sampledData.length - 1)) * 100;
                  const y =
                    100 - ((d.projectedBalance - minBalance) / range) * 80 - 10;
                  return `L ${x} ${y}`;
                })
                .join(' ')}
              L 100 100
              Z
            `}
            fill="hsl(var(--primary))"
            fillOpacity="0.1"
          />
        </svg>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between px-1 text-muted-foreground text-xs">
        <span>{formatDate(data[0]?.date ?? '')}</span>
        <span>{formatDate(data[data.length - 1]?.date ?? '')}</span>
      </div>
    </div>
  );
}
