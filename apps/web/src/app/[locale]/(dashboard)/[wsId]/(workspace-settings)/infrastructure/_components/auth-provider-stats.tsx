'use client';

import type { AuthProviderStats, SignInByProvider } from '@tuturuuu/types';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface Props {
  providerStats: AuthProviderStats[];
  signInsByProvider?: SignInByProvider[];
}

const COLORS = [
  'hsl(217, 91%, 60%)', // blue
  'hsl(142, 76%, 36%)', // green
  'hsl(262, 83%, 58%)', // purple
  'hsl(24, 95%, 53%)', // orange
  'hsl(340, 82%, 52%)', // pink
  'hsl(199, 89%, 48%)', // cyan
];

export default function AuthProviderStatsComponent({
  providerStats,
  signInsByProvider,
}: Props) {
  const t = useTranslations('infrastructure-analytics');

  const providerChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    providerStats.forEach((provider, idx) => {
      config[provider.provider] = {
        label: provider.provider,
        color: COLORS[idx % COLORS.length] || COLORS[0]!,
      };
    });
    return config;
  }, [providerStats]);

  const signInTrendData = useMemo(() => {
    if (!signInsByProvider) return [];

    // Group by date and aggregate providers
    const dateMap = new Map<string, Record<string, number>>();

    signInsByProvider.forEach((item) => {
      const existing = dateMap.get(item.date) || {};
      existing[item.provider] = item.sign_in_count;
      dateMap.set(item.date, existing);
    });

    return Array.from(dateMap.entries())
      .map(([date, providers]) => ({
        date: new Date(date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        ...providers,
      }))
      .slice(-30); // Last 30 days
  }, [signInsByProvider]);

  if (!providerStats.length) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {t('auth.no-data')}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Provider Distribution */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Pie Chart */}
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="font-semibold text-lg">
              {t('auth.provider-distribution')}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t('auth.provider-distribution-description')}
            </p>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={providerStats.map((stat) => ({
                  ...stat,
                  name: stat.provider,
                  value: stat.user_count,
                }))}
                dataKey="user_count"
                nameKey="provider"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ provider, percentage }) =>
                  `${provider}: ${percentage}%`
                }
              >
                {providerStats.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Provider Stats Table */}
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="font-semibold text-lg">
              {t('auth.provider-details')}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t('auth.provider-details-description')}
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-sm">
                    {t('auth.provider')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-sm">
                    {t('auth.users')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-sm">
                    {t('auth.percentage')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {providerStats.map((provider, idx) => (
                  <tr
                    key={provider.provider}
                    className="transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{
                            backgroundColor: COLORS[idx % COLORS.length],
                          }}
                        />
                        <span className="font-medium capitalize">
                          {provider.provider}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {provider.user_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {provider.percentage}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Sign-in Trends */}
      {signInTrendData.length > 0 && (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="font-semibold text-lg">
              {t('auth.sign-in-trends')}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t('auth.sign-in-trends-description')}
            </p>
          </div>

          <ChartContainer config={providerChartConfig} className="h-80 w-full">
            <BarChart
              data={signInTrendData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              {providerStats.map((provider, idx) => (
                <Bar
                  key={provider.provider}
                  dataKey={provider.provider}
                  stackId="a"
                  fill={COLORS[idx % COLORS.length]}
                />
              ))}
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </div>
  );
}
