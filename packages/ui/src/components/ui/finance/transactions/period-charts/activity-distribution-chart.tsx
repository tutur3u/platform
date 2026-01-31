'use client';

import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import type { TransactionViewMode } from '@tuturuuu/types/primitives/TransactionPeriod';
import { cn } from '@tuturuuu/utils/format';
import moment from 'moment';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../../../chart';

// Cookie helper functions
const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const nameEQ = `${name}=`;
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    if (!c) continue;
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
};

interface ActivityDistributionChartProps {
  transactions: Transaction[];
  viewMode: TransactionViewMode;
  periodStart: string;
  currency?: string;
  className?: string;
}

interface ActivityBucket {
  label: string;
  shortLabel: string;
  income: number;
  expense: number;
}

export function ActivityDistributionChart({
  transactions,
  viewMode,
  periodStart,
  currency = 'USD',
  className,
}: ActivityDistributionChartProps) {
  const t = useTranslations('finance-transactions');
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const [isConfidential, setIsConfidential] = useState(true);

  const incomeColor = resolvedTheme === 'dark' ? '#4ade80' : '#16a34a';
  const expenseColor = resolvedTheme === 'dark' ? '#f87171' : '#dc2626';

  // Sync with confidential mode cookie
  useEffect(() => {
    const saved = getCookie('finance-confidential-mode');
    if (saved !== null) {
      setIsConfidential(saved === 'true');
    }

    const handleStorageChange = () => {
      const newValue = getCookie('finance-confidential-mode');
      if (newValue !== null) {
        setIsConfidential(newValue === 'true');
      }
    };

    window.addEventListener(
      'finance-confidential-mode-change',
      handleStorageChange as EventListener
    );

    return () => {
      window.removeEventListener(
        'finance-confidential-mode-change',
        handleStorageChange as EventListener
      );
    };
  }, []);

  // Generate buckets based on view mode
  const chartData = useMemo(() => {
    const periodMoment = moment(periodStart);
    let buckets: ActivityBucket[] = [];

    switch (viewMode) {
      case 'daily': {
        // 24 hourly buckets
        buckets = Array.from({ length: 24 }, (_, i) => ({
          label: `${i}:00`,
          shortLabel: i % 4 === 0 ? `${i}h` : '',
          income: 0,
          expense: 0,
        }));
        break;
      }
      case 'weekly': {
        // 7 daily buckets (Mon-Sun)
        const weekStart = periodMoment.clone().startOf('isoWeek');
        buckets = Array.from({ length: 7 }, (_, i) => {
          const day = weekStart.clone().add(i, 'days');
          return {
            label: day.format('dddd'),
            shortLabel: day.format('ddd').slice(0, 2),
            income: 0,
            expense: 0,
          };
        });
        break;
      }
      case 'monthly': {
        // 4-5 weekly buckets
        const monthStart = periodMoment.clone().startOf('month');
        const monthEnd = periodMoment.clone().endOf('month');
        const weeks: ActivityBucket[] = [];
        let weekNum = 1;
        let current = monthStart.clone().startOf('isoWeek');

        while (current.isBefore(monthEnd)) {
          weeks.push({
            label: `Week ${weekNum}`,
            shortLabel: `W${weekNum}`,
            income: 0,
            expense: 0,
          });
          current = current.add(1, 'week');
          weekNum++;
        }
        buckets = weeks;
        break;
      }
      case 'yearly': {
        // 12 monthly buckets
        buckets = Array.from({ length: 12 }, (_, i) => {
          const month = moment().month(i);
          return {
            label: month.format('MMMM'),
            shortLabel: month.format('MMM').slice(0, 3),
            income: 0,
            expense: 0,
          };
        });
        break;
      }
    }

    // Distribute transactions into buckets
    transactions.forEach((tx) => {
      if (tx.amount === null && tx.is_amount_confidential) return;
      if (!tx.taken_at || !tx.amount) return;

      const txMoment = moment(tx.taken_at);
      let bucketIndex = 0;

      switch (viewMode) {
        case 'daily':
          bucketIndex = txMoment.hour();
          break;
        case 'weekly':
          bucketIndex = txMoment.isoWeekday() - 1; // 0-6 for Mon-Sun
          break;
        case 'monthly': {
          const monthStart = periodMoment.clone().startOf('month');
          const txWeekStart = txMoment.clone().startOf('isoWeek');
          const firstWeekStart = monthStart.clone().startOf('isoWeek');
          bucketIndex = Math.floor(
            txWeekStart.diff(firstWeekStart, 'weeks', true)
          );
          bucketIndex = Math.max(0, Math.min(bucketIndex, buckets.length - 1));
          break;
        }
        case 'yearly':
          bucketIndex = txMoment.month();
          break;
      }

      if (bucketIndex >= 0 && bucketIndex < buckets.length) {
        const bucket = buckets[bucketIndex];
        if (bucket) {
          if (tx.amount > 0) {
            bucket.income += tx.amount;
          } else {
            bucket.expense += Math.abs(tx.amount);
          }
        }
      }
    });

    return buckets;
  }, [transactions, viewMode, periodStart]);

  // Find busiest bucket
  const busiestBucket = useMemo(() => {
    const maxBucket = chartData.reduce(
      (max, bucket) => {
        const total = bucket.income + bucket.expense;
        return total > max.total ? { label: bucket.label, total } : max;
      },
      { label: '', total: 0 }
    );
    return maxBucket.total > 0 ? maxBucket.label : null;
  }, [chartData]);

  const formatValue = (value: number) => {
    if (isConfidential) return '•••••';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Check if there's any activity
  const hasActivity = chartData.some(
    (bucket) => bucket.income > 0 || bucket.expense > 0
  );

  if (!hasActivity) {
    return (
      <div
        className={cn(
          'flex h-24 items-center justify-center text-muted-foreground text-xs',
          className
        )}
      >
        {t('not-enough-data')}
      </div>
    );
  }

  // Get activity title based on view mode
  const activityTitle = (() => {
    switch (viewMode) {
      case 'daily':
        return t('activity-by-hour');
      case 'weekly':
        return t('activity-by-day');
      case 'monthly':
        return t('activity-by-week');
      case 'yearly':
        return t('activity-by-month');
      default:
        return t('activity-by-day');
    }
  })();

  const chartConfig = {
    income: {
      label: t('income'),
      color: incomeColor,
    },
    expense: {
      label: t('expense'),
      color: expenseColor,
    },
  } satisfies ChartConfig;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <span className="font-medium text-muted-foreground text-xs">
          {activityTitle}
        </span>
        {busiestBucket && (
          <span className="text-muted-foreground text-xs">
            {t('busiest-time', { time: busiestBucket })}
          </span>
        )}
      </div>

      <ChartContainer config={chartConfig} className="h-20 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={1}>
            <XAxis
              dataKey="shortLabel"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              interval={viewMode === 'daily' ? 3 : 0}
              height={16}
            />
            <YAxis hide />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload as
                      | ActivityBucket
                      | undefined;
                    return item?.label || '';
                  }}
                  formatter={(value, name) => {
                    const color =
                      name === t('income') ? incomeColor : expenseColor;
                    return [
                      <span key={String(name)} style={{ color }}>
                        {formatValue(Number(value))}
                      </span>,
                      name,
                    ];
                  }}
                />
              }
              cursor={{ fill: 'hsl(var(--foreground))', opacity: 0.05 }}
            />
            <Bar
              dataKey="income"
              fill={incomeColor}
              name={t('income')}
              radius={[2, 2, 0, 0]}
              maxBarSize={viewMode === 'daily' ? 8 : 20}
            />
            <Bar
              dataKey="expense"
              fill={expenseColor}
              name={t('expense')}
              radius={[2, 2, 0, 0]}
              maxBarSize={viewMode === 'daily' ? 8 : 20}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: incomeColor }}
          />
          <span className="text-muted-foreground">{t('income')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: expenseColor }}
          />
          <span className="text-muted-foreground">{t('expense')}</span>
        </div>
      </div>
    </div>
  );
}
