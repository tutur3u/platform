'use client';

import { Eye, EyeOff } from '@tuturuuu/icons';
import { getCurrencyLocale } from '@tuturuuu/utils/currencies';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '../../../button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../../../chart';
import {
  FINANCE_HIDDEN_AMOUNT,
  FINANCE_HIDDEN_COMPACT_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../use-finance-confidential-visibility';

type ViewMode = 'all' | 'income' | 'expense';

export function MonthlyTotalChart({
  data,
  className,
  currency = 'USD',
  openingBalance,
  closingBalance,
}: {
  data: { month: string; total_income: number; total_expense: number }[];
  className?: string;
  currency?: string;
  openingBalance?: number;
  closingBalance?: number;
}) {
  const locale = useLocale();
  const t = useTranslations('transaction-data-table');
  const tAnalytics = useTranslations('finance-analytics');
  const { resolvedTheme } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const { isConfidential, toggleConfidential } =
    useFinanceConfidentialVisibility();

  const incomeColor = resolvedTheme === 'dark' ? '#4ade80' : '#16a34a';
  const expenseColor = resolvedTheme === 'dark' ? '#f87171' : '#dc2626';

  const formatValue = (value: number) => {
    if (isConfidential) return FINANCE_HIDDEN_AMOUNT;
    return new Intl.NumberFormat(getCurrencyLocale(currency), {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatCompactValue = (value: number) => {
    if (isConfidential) return FINANCE_HIDDEN_COMPACT_AMOUNT;
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(value);
  };

  if (!data || data.length === 0) {
    return (
      <Card className={cn('flex flex-col', className)}>
        <CardHeader>
          <CardTitle>{t('monthly_total_from_12_recent_months')}</CardTitle>
        </CardHeader>
        <CardContent className="flex h-75 items-center justify-center">
          <p className="text-muted-foreground text-sm">
            {tAnalytics('no-data')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((item) => ({
    month: item.month,
    income: Number(item.total_income) || 0,
    expense: Number(item.total_expense) || 0,
  }));

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
    <Card className={cn('flex flex-col', className)}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t('monthly_total_from_12_recent_months')}</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleConfidential}
              className="h-8 w-8 shrink-0"
              title={
                isConfidential ? t('show_confidential') : t('hide_confidential')
              }
            >
              {isConfidential ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
            <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className={cn(
                  'rounded-md px-3 py-1.5 font-medium text-xs transition-colors',
                  viewMode === 'all'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t('all')}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('income')}
                className={cn(
                  'rounded-md px-3 py-1.5 font-medium text-xs transition-colors',
                  viewMode === 'income'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t('income')}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('expense')}
                className={cn(
                  'rounded-md px-3 py-1.5 font-medium text-xs transition-colors',
                  viewMode === 'expense'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t('expense')}
              </button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <ChartContainer config={chartConfig} className="h-80 w-full">
          <BarChart data={chartData}>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              opacity={0.3}
            />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => {
                try {
                  return Intl.DateTimeFormat(locale, {
                    month: locale === 'vi' ? 'numeric' : 'short',
                    year: 'numeric',
                  }).format(new Date(value));
                } catch {
                  return value;
                }
              }}
              tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) =>
                typeof value === 'number' ? formatCompactValue(value) : value
              }
              tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
              width={60}
            />
            <Legend
              wrapperStyle={{
                paddingTop: '20px',
              }}
              iconType="rect"
              iconSize={12}
            />
            <ChartTooltip
              content={<ChartTooltipContent indicator="dot" />}
              labelFormatter={(value) => {
                try {
                  return Intl.DateTimeFormat(locale, {
                    month: 'long',
                    year: 'numeric',
                  }).format(new Date(String(value ?? '')));
                } catch {
                  return value;
                }
              }}
              formatter={(value, name) => {
                const formattedValue =
                  typeof value === 'number' ? formatValue(value) : value;

                return [
                  <span
                    key={name}
                    style={{
                      color: name === t('income') ? incomeColor : expenseColor,
                      fontWeight: 600,
                      fontSize: '0.875rem',
                    }}
                  >
                    {formattedValue}
                  </span>,
                  name,
                ];
              }}
              cursor={{ fill: 'hsl(var(--foreground))', opacity: 0.05 }}
            />
            {(viewMode === 'all' || viewMode === 'income') && (
              <Bar
                dataKey="income"
                fill="var(--color-income)"
                name={t('income')}
                minPointSize={1}
                radius={[4, 4, 0, 0]}
                maxBarSize={50}
              />
            )}
            {(viewMode === 'all' || viewMode === 'expense') && (
              <Bar
                dataKey="expense"
                fill="var(--color-expense)"
                name={t('expense')}
                minPointSize={1}
                radius={[4, 4, 0, 0]}
                maxBarSize={50}
              />
            )}
            {openingBalance !== undefined && !isConfidential && (
              <ReferenceLine
                y={openingBalance}
                stroke="hsl(var(--primary))"
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{
                  value: t('opening_balance'),
                  position: 'insideTopLeft',
                  fill: 'hsl(var(--primary))',
                  fontSize: 12,
                }}
              />
            )}
            {closingBalance !== undefined && !isConfidential && (
              <ReferenceLine
                y={closingBalance}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{
                  value: t('closing_balance'),
                  position: 'insideBottomLeft',
                  fill: 'hsl(var(--muted-foreground))',
                  fontSize: 12,
                }}
              />
            )}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
