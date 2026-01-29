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
import { useLocale } from 'next-intl';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

interface CategorySpendingChartProps {
  wsId: string;
  startDate?: string;
  endDate?: string;
  className?: string;
  currency?: string;
}

const COLORS = [
  '#f87171', // red-400
  '#fb923c', // orange-400
  '#fbbf24', // amber-400
  '#4ade80', // green-400
  '#22d3ee', // cyan-400
  '#60a5fa', // blue-400
  '#a78bfa', // violet-400
  '#f472b6', // pink-400
  '#fb7185', // rose-400
  '#34d399', // emerald-400
];

export function CategorySpendingChart({
  wsId,
  startDate,
  endDate,
  className,
  currency = 'USD',
}: CategorySpendingChartProps) {
  const locale = useLocale();
  const supabase = createClient();

  const { data: categoryData, isLoading } = useQuery({
    queryKey: ['category_spending', wsId, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from('wallet_transactions')
        .select(
          `
          amount,
          category_id,
          transaction_categories(name),
          workspace_wallets!inner(ws_id)
        `
        )
        .eq('workspace_wallets.ws_id', wsId)
        .lt('amount', 0); // Only expenses

      if (startDate) {
        query = query.gte('taken_at', startDate);
      }

      if (endDate) {
        query = query.lte('taken_at', endDate);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Group by category and sum amounts
      const categoryMap = new Map<string, number>();

      data?.forEach((transaction: any) => {
        const categoryName =
          transaction.transaction_categories?.name || 'Uncategorized';
        const amount = Math.abs(Number(transaction.amount));

        categoryMap.set(
          categoryName,
          (categoryMap.get(categoryName) || 0) + amount
        );
      });

      // Convert to array and sort by amount
      const chartData = Array.from(categoryMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10); // Top 10 categories

      return chartData;
    },
  });

  const chartConfig =
    categoryData?.reduce((acc, item, index) => {
      acc[item.name] = {
        label: item.name,
        color: COLORS[index % COLORS.length],
      };
      return acc;
    }, {} as ChartConfig) || {};

  const totalSpending =
    categoryData?.reduce((sum, item) => sum + item.value, 0) || 0;

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader>
        <CardTitle>Spending by Category</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : categoryData && categoryData.length > 0 ? (
          <div className="space-y-4">
            <ChartContainer config={chartConfig} className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(props: any) =>
                      `${props.name}: ${((props.percent || 0) * 100).toFixed(0)}%`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell
                        key={`cell-${entry.name}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) =>
                          new Intl.NumberFormat(locale, {
                            style: 'currency',
                            currency,
                          }).format(Number(value))
                        }
                      />
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>

            <div className="space-y-2">
              <div className="flex justify-between border-b pb-2 font-semibold">
                <span>Category</span>
                <span>Amount</span>
              </div>
              {categoryData.map((item, index) => {
                const percentage = (item.value / totalSpending) * 100;
                return (
                  <div
                    key={item.name}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{
                          backgroundColor: COLORS[index % COLORS.length],
                        }}
                      />
                      <span>{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {percentage.toFixed(1)}%
                      </span>
                      <span className="font-medium">
                        {new Intl.NumberFormat(locale, {
                          style: 'currency',
                          currency,
                        }).format(item.value)}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div className="border-t pt-2 font-semibold">
                <div className="flex items-center justify-between">
                  <span>Total</span>
                  <span>
                    {new Intl.NumberFormat(locale, {
                      style: 'currency',
                      currency,
                    }).format(totalSpending)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            No spending data available for the selected period
          </div>
        )}
      </CardContent>
    </Card>
  );
}
