'use client';

import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
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

export function HourlyTotalChart({
  data,
}: {
  data: {
    hour: string;
    total_prompt_tokens: number;
    total_completion_tokens: number;
  }[];
}) {
  const locale = useLocale();
  const t = useTranslations('platform-token-usage');

  useEffect(() => {
    const chart = document.getElementById('hourly-total-chart');
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
    <div className="flex flex-col items-center justify-center gap-2 text-center">
      <div className="font-semibold">
        {t('hourly_total_from_last_12_hours')}
      </div>
      <ResponsiveContainer
        id="hourly-total-chart"
        className="grid items-center justify-center overflow-x-auto"
      >
        <BarChart data={data} width={data.length * 75} height={300}>
          <XAxis
            dataKey="hour"
            tickFormatter={(value) => {
              return Intl.DateTimeFormat(locale, {
                hour: 'numeric',
                minute: 'numeric',
                hour12: false,
              }).format(new Date(value));
            }}
            tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
          />
          <YAxis
            tickFormatter={(value) => {
              return typeof value === 'number'
                ? Intl.NumberFormat(locale, {
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
              return Intl.DateTimeFormat(locale, {
                hour: 'numeric',
                minute: 'numeric',
                hour12: false,
              }).format(new Date(value));
            }}
            formatter={(value, name) => {
              return (
                <span
                  className={cn(
                    name === t('prompt_tokens')
                      ? 'text-dynamic-orange'
                      : 'text-dynamic-purple'
                  )}
                >
                  {typeof value === 'number'
                    ? Intl.NumberFormat(locale, {
                        style: 'decimal',
                      }).format(value)
                    : value}
                </span>
              );
            }}
            cursor={{ fill: 'hsl(var(--foreground))', opacity: 0.1 }}
          />
          <Bar
            dataKey="total_prompt_tokens"
            fill="hsl(var(--orange))"
            name={t('prompt_tokens')}
          />
          <Bar
            dataKey="total_completion_tokens"
            fill="hsl(var(--purple))"
            name={t('completion_tokens')}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DailyTotalChart({
  data,
}: {
  data: {
    day: string;
    total_prompt_tokens: number;
    total_completion_tokens: number;
  }[];
}) {
  const locale = useLocale();
  const t = useTranslations('platform-token-usage');

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
    <div className="flex flex-col items-center justify-center gap-2 text-center">
      <div className="font-semibold">
        {t('daily_total_from_14_recent_days')}
      </div>
      <ResponsiveContainer
        id="daily-total-chart"
        className="grid items-center justify-center overflow-x-auto"
      >
        <BarChart data={data} width={data.length * 75} height={300}>
          <XAxis
            dataKey="day"
            tickFormatter={(value) => {
              return Intl.DateTimeFormat(locale, {
                day: 'numeric',
                month: locale === 'vi' ? 'numeric' : 'short',
              }).format(new Date(value));
            }}
            tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
          />
          <YAxis
            tickFormatter={(value) => {
              return typeof value === 'number'
                ? Intl.NumberFormat(locale, {
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
              return Intl.DateTimeFormat(locale, {
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
                    name === t('prompt_tokens')
                      ? 'text-dynamic-orange'
                      : 'text-dynamic-purple'
                  )}
                >
                  {typeof value === 'number'
                    ? Intl.NumberFormat(locale, {
                        style: 'decimal',
                      }).format(value)
                    : value}
                </span>
              );
            }}
            cursor={{ fill: 'hsl(var(--foreground))', opacity: 0.1 }}
          />
          <Bar
            dataKey="total_prompt_tokens"
            fill="hsl(var(--orange))"
            name={t('prompt_tokens')}
          />
          <Bar
            dataKey="total_completion_tokens"
            fill="hsl(var(--purple))"
            name={t('completion_tokens')}
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
    total_prompt_tokens: number;
    total_completion_tokens: number;
  }[];
}) {
  const locale = useLocale();
  const t = useTranslations('platform-token-usage');

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
    <div className="flex flex-col items-center justify-center gap-2 text-center">
      <div className="font-semibold">
        {t('monthly_total_from_12_recent_months')}
      </div>
      <ResponsiveContainer
        id="monthly-total-chart"
        className="grid items-center justify-center overflow-x-auto"
      >
        <BarChart data={data} width={data.length * 100} height={300}>
          <XAxis
            dataKey="month"
            tickFormatter={(value) => {
              return Intl.DateTimeFormat(locale, {
                month: locale === 'vi' ? 'numeric' : 'short',
                year: 'numeric',
              }).format(new Date(value));
            }}
            tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
          />
          <YAxis
            tickFormatter={(value) => {
              return typeof value === 'number'
                ? Intl.NumberFormat(locale, {
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
              return Intl.DateTimeFormat(locale, {
                month: 'long',
                year: 'numeric',
              }).format(new Date(value));
            }}
            formatter={(value, name) => {
              return (
                <span
                  className={cn(
                    name === t('prompt_tokens')
                      ? 'text-dynamic-orange'
                      : 'text-dynamic-purple'
                  )}
                >
                  {typeof value === 'number'
                    ? Intl.NumberFormat(locale, {
                        style: 'decimal',
                      }).format(value)
                    : value}
                </span>
              );
            }}
            cursor={{ fill: 'hsl(var(--foreground))', opacity: 0.1 }}
          />
          <Bar
            dataKey="total_prompt_tokens"
            fill="hsl(var(--orange))"
            name={t('prompt_tokens')}
          />
          <Bar
            dataKey="total_completion_tokens"
            fill="hsl(var(--purple))"
            name={t('completion_tokens')}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
