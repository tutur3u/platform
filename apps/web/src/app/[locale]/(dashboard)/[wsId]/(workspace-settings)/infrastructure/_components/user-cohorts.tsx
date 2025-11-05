'use client';

import type { RetentionRate, UserActivityCohort } from '@tuturuuu/types';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { TrendingDown, TrendingUp, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';

interface Props {
  cohorts: UserActivityCohort[];
  retentionData?: RetentionRate[];
}

const COHORT_COLORS: Record<string, string> = {
  'New Users (< 7 days)': 'hsl(142, 76%, 36%)',
  'Active (< 7 days)': 'hsl(217, 91%, 60%)',
  'Casual (7-30 days)': 'hsl(48, 96%, 53%)',
  'At Risk (30-90 days)': 'hsl(24, 95%, 53%)',
  'Churned (> 90 days)': 'hsl(0, 72%, 51%)',
  'Never Logged In': 'hsl(0, 0%, 50%)',
};

export default function UserCohortsComponent({
  cohorts,
  retentionData,
}: Props) {
  const t = useTranslations('infrastructure-analytics');

  const chartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    cohorts.forEach((cohort) => {
      config[cohort.cohort_name] = {
        label: cohort.cohort_name,
        color: COHORT_COLORS[cohort.cohort_name] || 'hsl(0, 0%, 50%)',
      };
    });
    return config;
  }, [cohorts]);

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Cohort Distribution */}
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="font-semibold text-lg">
            {t('cohorts.user-lifecycle')}
          </h3>
          <p className="text-muted-foreground text-sm">
            {t('cohorts.user-lifecycle-description')}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Bar Chart */}
          <ChartContainer config={chartConfig} className="h-80 w-full">
            <BarChart
              data={cohorts}
              margin={{ top: 10, right: 10, left: 0, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="cohort_name"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                angle={-45}
                textAnchor="end"
                height={100}
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="user_count" radius={[8, 8, 0, 0]}>
                {cohorts.map((entry) => (
                  <Cell
                    key={entry.cohort_name}
                    fill={
                      COHORT_COLORS[entry.cohort_name] ||
                      COHORT_COLORS['Never Logged In']
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>

          {/* Cohort Cards */}
          <div className="space-y-3">
            {cohorts.map((cohort) => {
              const isHealthy =
                cohort.cohort_name.includes('Active') ||
                cohort.cohort_name.includes('New');
              const isAtRisk =
                cohort.cohort_name.includes('At Risk') ||
                cohort.cohort_name.includes('Casual');

              return (
                <div
                  key={cohort.cohort_name}
                  className="rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="rounded-lg p-2"
                        style={{
                          backgroundColor: `${COHORT_COLORS[cohort.cohort_name]}20`,
                        }}
                      >
                        {isHealthy ? (
                          <TrendingUp
                            className="h-5 w-5"
                            style={{ color: COHORT_COLORS[cohort.cohort_name] }}
                          />
                        ) : isAtRisk ? (
                          <Users
                            className="h-5 w-5"
                            style={{ color: COHORT_COLORS[cohort.cohort_name] }}
                          />
                        ) : (
                          <TrendingDown
                            className="h-5 w-5"
                            style={{ color: COHORT_COLORS[cohort.cohort_name] }}
                          />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{cohort.cohort_name}</p>
                        <p className="text-muted-foreground text-sm">
                          {cohort.user_count.toLocaleString()}{' '}
                          {t('cohorts.users')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-lg">
                        {cohort.percentage}%
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {t('cohorts.of-total')}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Retention Analysis */}
      {retentionData && retentionData.length > 0 && (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="font-semibold text-lg">
              {t('cohorts.retention-analysis')}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t('cohorts.retention-analysis-description')}
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-sm">
                    {t('cohorts.period')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-sm">
                    {t('cohorts.cohort-size')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-sm">
                    {t('cohorts.retained-users')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-sm">
                    {t('cohorts.retention-rate')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {retentionData.slice(0, 10).map((retention) => {
                  const retentionPercentage = retention.retention_rate;
                  const isGood = retentionPercentage >= 50;
                  const isFair = retentionPercentage >= 30;

                  return (
                    <tr
                      key={retention.cohort_period}
                      className="transition-colors hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 font-medium">
                        {new Date(retention.cohort_period).toLocaleDateString(
                          'en-US',
                          { month: 'short', year: 'numeric' }
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {retention.cohort_size.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {retention.retained_users.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium text-sm ${
                            isGood
                              ? 'bg-dynamic-green/20 text-dynamic-green'
                              : isFair
                                ? 'bg-dynamic-yellow/20 text-dynamic-yellow'
                                : 'bg-dynamic-red/20 text-dynamic-red'
                          }`}
                        >
                          {retentionPercentage.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
