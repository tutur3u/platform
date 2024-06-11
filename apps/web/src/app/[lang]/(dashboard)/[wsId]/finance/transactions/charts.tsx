'use client';

import { cn } from '@/lib/utils';
import useTranslation from 'next-translate/useTranslation';
import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export function DailyTotalChart({
  data,
}: {
  data: {
    day: string;
    total_income: number;
    total_expense: number;
  }[];
}) {
  const { t, lang } = useTranslation('transaction-data-table');

  return (
    <ResponsiveContainer className="hidden md:flex overflow-x-auto items-center justify-center">
      <BarChart
        data={data}
        width={data.length * 75}
        height={300}
        margin={{ top: 5, left: 100, bottom: 5 }}
      >
        <XAxis
          dataKey="day"
          tickFormatter={(value) => {
            return Intl.DateTimeFormat(lang, {
              weekday: lang === 'vi' ? 'narrow' : 'short',
              day: 'numeric',
              month: 'short',
            }).format(new Date(value));
          }}
        />
        <YAxis
          tickFormatter={(value) => {
            return typeof value === 'number'
              ? Intl.NumberFormat(lang, {
                  style: 'decimal',
                  notation: 'compact',
                }).format(value)
              : value;
          }}
        />
        <Legend />
        <Tooltip
          labelClassName="text-foreground font-semibold"
          itemStyle={{ color: 'hsl(var(--foreground))' }}
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            borderColor: 'hsl(var(--foreground))',
            borderRadius: '0.5rem',
          }}
          separator=": "
          labelFormatter={(value) => {
            return Intl.DateTimeFormat(lang, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }).format(new Date(value));
          }}
          formatter={(value, name) => {
            return (
              <span
                className={cn(
                  name === t('income')
                    ? 'text-dynamic-green'
                    : 'text-dynamic-red'
                )}
              >
                {typeof value === 'number'
                  ? Intl.NumberFormat(lang, {
                      style: 'decimal',
                    }).format(value)
                  : value}
              </span>
            );
          }}
          cursor={{ fill: 'hsl(var(--foreground))', opacity: 0.1 }}
        />
        <Bar
          dataKey="total_income"
          fill="hsl(var(--green))"
          name={t('income')}
          minPointSize={2}
        />
        <Bar
          dataKey="total_expense"
          fill="hsl(var(--red))"
          name={t('expense')}
          minPointSize={2}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
