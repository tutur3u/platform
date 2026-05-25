'use client';

import { useQuery } from '@tanstack/react-query';
import { getSpendingTrends } from '@tuturuuu/internal-api/finance';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

interface SpendingTrendsChartProps {
  wsId: string;
  className?: string;
  currency?: string;
}

export function SpendingTrendsChart({
  wsId,
  className,
  currency = 'USD',
}: SpendingTrendsChartProps) {
  const locale = useLocale();
  const t = useTranslations('finance-analytics');
  const { resolvedTheme } = useTheme();

  const expenseColor = resolvedTheme === 'dark' ? '#f87171' : '#dc2626';
  const formatChartDate = (
    value: string,
    options: Intl.DateTimeFormatOptions
  ) => new Intl.DateTimeFormat(locale, options).format(new Date(value));

  const { data: trendsData, isLoading } = useQuery({
    queryKey: ['spending_trends', wsId],
    queryFn: async () => getSpendingTrends(wsId, { days: 30 }),
  });

  const chartConfig = {
    amount: {
      label: t('spending-trends'),
      color: expenseColor,
    },
  } satisfies ChartConfig;

  const averageSpending =
    trendsData && trendsData.length > 0
      ? trendsData.reduce((sum, item) => sum + item.amount, 0) /
        trendsData.length
      : 0;

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader>
        <CardTitle>{t('spending-trends')}</CardTitle>
        <p className="text-muted-foreground text-sm">
          {t('daily-avg-expense')}:{' '}
          {new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
          }).format(averageSpending)}
        </p>
      </CardHeader>
      <CardContent className="flex-1">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : trendsData && trendsData.length > 0 ? (
          <ChartContainer config={chartConfig} className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendsData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) =>
                    formatChartDate(value, {
                      day: 'numeric',
                      month: 'short',
                    })
                  }
                  tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
                />
                <YAxis
                  tickFormatter={(value) =>
                    new Intl.NumberFormat(locale, {
                      style: 'decimal',
                      notation: 'compact',
                    }).format(value)
                  }
                  tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) =>
                        formatChartDate(String(value), {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      }
                      formatter={(value) =>
                        new Intl.NumberFormat(locale, {
                          style: 'currency',
                          currency,
                        }).format(Number(value))
                      }
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke={expenseColor}
                  strokeWidth={2}
                  dot={{ fill: expenseColor, r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        ) : (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            {t('no-data')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
