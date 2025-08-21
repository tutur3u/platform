'use client';

import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../../../ui/chart';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';

export function DailyTotalChart({
  data,
  className,
}: {
  data: { day: string; total_income: number; total_expense: number }[];
  className?: string;
}) {
  const t = useTranslations('transaction-data-table');

  const chartData = data.map((item) => ({
    month: item.day,
    income: item.total_income,
    expense: item.total_expense,
  }));

  const chartConfig = {
    income: {
      label: t('income'),
      color: 'hsl(var(--chart-1))',
    },
    expense: {
      label: t('expense'),
      color: 'hsl(var(--chart-2))',
    },
  } satisfies ChartConfig;

  return (
    <Card
      className={cn(
        'flex flex-col items-center justify-center gap-2 overflow-x-auto text-center',
        className
      )}
    >
      <CardHeader>
        <CardTitle>{t('daily_total_from_14_recent_days')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dashed" />}
            />
            <Bar dataKey="income" fill="var(--red)" radius={4} />
            <Bar dataKey="expense" fill="var(--green)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
