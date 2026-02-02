'use client';

import { TrendingUp } from '@tuturuuu/icons';
import type { InterestProjection } from '@tuturuuu/types';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { useCurrencyFormatter } from '@tuturuuu/ui/hooks/use-currency-formatter';
import { Toggle } from '@tuturuuu/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

export type ChartPeriod = 'week' | 'month' | 'quarter' | 'year';

interface WalletInterestChartProps {
  projections: {
    week: InterestProjection[];
    month: InterestProjection[];
    quarter: InterestProjection[];
    year: InterestProjection[];
  };
  dailyHistory?: Array<{
    date: string;
    balance: number;
    interestEarned: number;
    cumulativeInterest: number;
  }>;
  currency: string;
  currentBalance: number;
  defaultPeriod?: ChartPeriod;
  showProjections?: boolean;
  onPeriodChange?: (period: ChartPeriod) => void;
  onShowProjectionsChange?: (show: boolean) => void;
}

interface ChartDataPoint {
  date: string;
  displayDate: string;
  balance: number;
  interest: number;
  dailyInterest: number;
  isProjection: boolean;
}

/**
 * Interactive chart showing interest growth over time.
 * Uses Recharts ComposedChart with stacked bars (balance + interest) and line overlay.
 */
export function WalletInterestChart({
  projections,
  dailyHistory: _dailyHistory,
  currency,
  currentBalance,
  defaultPeriod = 'month',
  showProjections: initialShowProjections = true,
  onPeriodChange,
  onShowProjectionsChange,
}: WalletInterestChartProps) {
  const t = useTranslations('wallet-interest');
  const { formatCurrency, formatDate } = useCurrencyFormatter({ currency });

  const [period, setPeriod] = useState<ChartPeriod>(defaultPeriod);
  const [showProjections, setShowProjections] = useState(
    initialShowProjections
  );

  const handlePeriodChange = (value: string) => {
    if (value) {
      const newPeriod = value as ChartPeriod;
      setPeriod(newPeriod);
      onPeriodChange?.(newPeriod);
    }
  };

  const handleProjectionsToggle = (pressed: boolean) => {
    setShowProjections(pressed);
    onShowProjectionsChange?.(pressed);
  };

  // Transform projection data into chart format
  const chartData = useMemo((): ChartDataPoint[] => {
    const projectionData = projections[period] || [];
    if (projectionData.length === 0) return [];

    // Sample data points for display (max 15 points to avoid overcrowding)
    const maxPoints = period === 'week' ? 7 : period === 'month' ? 15 : 12;
    const step = Math.max(1, Math.floor(projectionData.length / maxPoints));

    const sampledData = projectionData.filter(
      (_, i) => i % step === 0 || i === projectionData.length - 1
    );

    return sampledData.map((p) => ({
      date: p.date,
      displayDate: formatDate(p.date),
      balance: Math.floor(currentBalance),
      // Show cumulative interest as the bar height (total growth)
      interest: Math.floor(p.projectedCumulativeInterest),
      // Daily interest for tooltip display (what you earn each day)
      dailyInterest: Math.floor(p.projectedDailyInterest),
      isProjection: true,
    }));
  }, [projections, period, currentBalance, formatDate]);

  // Calculate summary stats
  const summary = useMemo(() => {
    const data = projections[period] || [];
    if (data.length === 0) {
      return { totalInterest: 0, finalBalance: currentBalance, growth: 0 };
    }
    const lastDay = data[data.length - 1];
    const totalInterest = lastDay?.projectedCumulativeInterest ?? 0;
    const finalBalance = lastDay?.projectedBalance ?? currentBalance;
    const growth =
      currentBalance > 0
        ? ((finalBalance - currentBalance) / currentBalance) * 100
        : 0;
    return { totalInterest, finalBalance, growth };
  }, [projections, period, currentBalance]);

  // Use explicit HSL values for chart colors to ensure visibility in dark mode
  // These align with the dynamic color system (dynamic-green)
  const chartConfig: ChartConfig = {
    interest: {
      label: t('cumulative'),
      color: 'hsl(142, 76%, 36%)', // Green - matches dynamic-green
    },
    dailyInterest: {
      label: t('daily_interest'),
      color: 'hsl(217, 91%, 60%)', // Blue - for daily value
    },
  };

  const periodLabels: Record<ChartPeriod, string> = {
    week: t('7_days'),
    month: t('30_days'),
    quarter: t('90_days'),
    year: t('365_days'),
  };

  if (chartData.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            {t('interest_chart')}
          </CardTitle>

          <div className="flex items-center gap-2">
            <ToggleGroup
              type="single"
              value={period}
              onValueChange={handlePeriodChange}
              className="justify-start"
            >
              {(Object.keys(periodLabels) as ChartPeriod[]).map((p) => (
                <ToggleGroupItem
                  key={p}
                  value={p}
                  size="sm"
                  className="text-xs"
                >
                  {periodLabels[p]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <Toggle
              pressed={showProjections}
              onPressedChange={handleProjectionsToggle}
              size="sm"
              aria-label={t('show_projections')}
              className="data-[state=on]:bg-primary/10"
            >
              <TrendingUp className="h-4 w-4" />
            </Toggle>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="mt-3 grid grid-cols-3 gap-4 rounded-lg bg-muted/50 p-3">
          <div className="text-center">
            <p className="text-muted-foreground text-xs">
              {t('projected_interest')}
            </p>
            <p className="font-bold text-primary">
              +{formatCurrency(summary.totalInterest)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground text-xs">
              {t('final_balance')}
            </p>
            <p className="font-bold">{formatCurrency(summary.finalBalance)}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground text-xs">{t('growth')}</p>
            <p className="font-bold text-dynamic-green">
              +{summary.growth.toFixed(4)}%
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <BarChart
            data={showProjections ? chartData : []}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-muted"
              vertical={false}
            />
            <XAxis
              dataKey="displayDate"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              className="text-muted-foreground"
            />
            <YAxis
              tickFormatter={(value) => {
                if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
                return value.toString();
              }}
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={50}
              className="text-muted-foreground"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => label}
                  formatter={(value) => (
                    <span className="font-medium">
                      {formatCurrency(Number(value))}
                    </span>
                  )}
                />
              }
            />

            {/* Bars showing cumulative interest growth */}
            <Bar
              dataKey="interest"
              fill="var(--color-interest)"
              radius={[4, 4, 0, 0]}
              className={cn(!showProjections && 'opacity-30')}
            />
          </BarChart>
        </ChartContainer>

        {/* Legend */}
        <div className="mt-3 flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-[hsl(142,76%,36%)]" />
            <span className="text-muted-foreground">
              {t('cumulative_interest')}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
