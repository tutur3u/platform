'use client';

import type { SubscriptionPaymentPeriod } from '@tuturuuu/internal-api/finance-subscription-analytics';
import { useLocale, useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FINANCE_HIDDEN_AMOUNT } from '../../shared/use-finance-confidential-visibility';

export type PaymentMetric =
  | 'amount'
  | 'paidUsers'
  | 'paidGroups'
  | 'memberships';
export function SubscriptionPaymentChart({
  periods,
  metric,
  currency,
  hidden,
}: {
  periods: SubscriptionPaymentPeriod[];
  metric: PaymentMetric;
  currency: string;
  hidden: boolean;
}) {
  const t = useTranslations('invoice-subscriptions');
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale);
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency });
  const label = (value: string) =>
    value.length === 4
      ? value
      : new Intl.DateTimeFormat(locale, {
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${value}-01T00:00:00Z`));
  const format = (value: number, key: string) =>
    key === 'amount'
      ? hidden
        ? FINANCE_HIDDEN_AMOUNT
        : money.format(value)
      : number.format(value);
  if (hidden && metric === 'amount')
    return (
      <div className="flex h-64 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground text-sm">
        {t('hidden')}
      </div>
    );
  return (
    <div
      className="h-72 w-full min-w-0"
      role="img"
      aria-label={t('chart_label', { metric: t(metric) })}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={periods}
          accessibilityLayer
          margin={{ top: 16, right: 12, left: 12, bottom: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="period"
            tickFormatter={label}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={metric === 'amount'}
            width={66}
            tickFormatter={(value) =>
              new Intl.NumberFormat(locale, { notation: 'compact' }).format(
                value
              )
            }
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as
                | SubscriptionPaymentPeriod
                | undefined;
              if (!active || !row) return null;
              return (
                <div className="min-w-52 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg">
                  <p className="mb-3 font-semibold">{label(row.period)}</p>
                  {(
                    [
                      'amount',
                      'paidUsers',
                      'paidGroups',
                      'memberships',
                    ] as const
                  ).map((key) => (
                    <div
                      key={key}
                      className="flex justify-between gap-6 py-1 text-sm"
                    >
                      <span className="text-muted-foreground">{t(key)}</span>
                      <span className="font-medium tabular-nums">
                        {format(row[key], key)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Bar
            dataKey={metric}
            name={t(metric)}
            fill="var(--primary)"
            radius={[5, 5, 0, 0]}
            maxBarSize={48}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
