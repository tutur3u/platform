'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useLocale } from 'next-intl';
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
  const supabase = createClient();
  const { resolvedTheme } = useTheme();

  const expenseColor = resolvedTheme === 'dark' ? '#f87171' : '#dc2626';

  const { data: trendsData, isLoading } = useQuery({
    queryKey: ['spending_trends', wsId],
    queryFn: async () => {
      // Get last 30 days of spending
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const { data, error } = await supabase
        .from('wallet_transactions')
        .select(
          `
          amount,
          taken_at,
          workspace_wallets!inner(ws_id)
        `
        )
        .eq('workspace_wallets.ws_id', wsId)
        .lt('amount', 0) // Only expenses
        .gte('taken_at', startDate.toISOString())
        .order('taken_at', { ascending: true });

      if (error) throw error;

      // Group by day
      const dailySpending = new Map<string, number>();

      // Initialize all days with 0
      for (let i = 0; i < 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() - (29 - i));
        const dateStr = format(date, 'yyyy-MM-dd');
        dailySpending.set(dateStr, 0);
      }

      // Add actual spending
      data?.forEach((transaction: any) => {
        const dateStr = format(new Date(transaction.taken_at), 'yyyy-MM-dd');
        const amount = Math.abs(Number(transaction.amount));
        dailySpending.set(dateStr, (dailySpending.get(dateStr) || 0) + amount);
      });

      return Array.from(dailySpending.entries()).map(([date, amount]) => ({
        date,
        amount,
      }));
    },
  });

  const chartConfig = {
    amount: {
      label: 'Spending',
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
        <CardTitle>Spending Trends (Last 30 Days)</CardTitle>
        <p className="text-muted-foreground text-sm">
          Daily average:{' '}
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
                  tickFormatter={(value) => format(new Date(value), 'MMM dd')}
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
                        format(new Date(value), 'MMM dd, yyyy')
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
            No spending data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
