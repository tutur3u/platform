'use client';

import { cn } from '@/lib/utils';
import useTranslation from 'next-translate/useTranslation';
import { useEffect } from 'react';
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

  useEffect(() => {
    const chart = document.getElementById('daily-total-chart');
    if (chart) {
      setTimeout(() => {
        chart.scrollTo({
          left: chart.scrollWidth - chart.clientWidth,
          behavior: 'smooth',
        });
      }, 500);
    }
  }, []);

  return (
    <div className="flex gap-2 flex-col items-center">
      <div className="font-semibold">
        {t('daily_total_from_14_recent_days')}
      </div>
      <ResponsiveContainer
        id="daily-total-chart"
        className="overflow-x-auto grid items-center justify-center"
      >
        <BarChart data={data} width={data.length * 75} height={300}>
          <XAxis
            dataKey="day"
            tickFormatter={(value) => {
              return Intl.DateTimeFormat(lang, {
                day: 'numeric',
                month: 'long',
              }).format(new Date(value));
            }}
            tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
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
            tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
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
            minPointSize={1}
          />
          <Bar
            dataKey="total_expense"
            fill="hsl(var(--red))"
            name={t('expense')}
            minPointSize={1}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthlyTotalChart({
  data,
}: {
  data: {
    month: string;
    total_income: number;
    total_expense: number;
  }[];
}) {
  const { t, lang } = useTranslation('transaction-data-table');

  useEffect(() => {
    const chart = document.getElementById('monthly-total-chart');
    if (chart) {
      setTimeout(() => {
        chart.scrollTo({
          left: chart.scrollWidth - chart.clientWidth,
          behavior: 'smooth',
        });
      }, 500);
    }
  }, []);

  return (
    <div className="flex gap-2 justify-center flex-col items-center">
      <div className="font-semibold">
        {t('monthly_total_from_12_recent_months')}
      </div>
      <ResponsiveContainer
        id="monthly-total-chart"
        className="overflow-x-auto grid items-center justify-center"
      >
        <BarChart data={data} width={data.length * 100} height={300}>
          <XAxis
            dataKey="month"
            tickFormatter={(value) => {
              return Intl.DateTimeFormat(lang, {
                month: 'long',
              }).format(new Date(value));
            }}
            tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
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
            tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
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
            minPointSize={1}
          />
          <Bar
            dataKey="total_expense"
            fill="hsl(var(--red))"
            name={t('expense')}
            minPointSize={1}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
