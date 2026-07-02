'use client';

import { Activity, Clock, Users } from '@tuturuuu/icons';
import type {
  ActionFrequencyByHour,
  AuditLogActionSummary,
  RecentAuditLog,
} from '@tuturuuu/types';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

interface Props {
  actionsSummary: AuditLogActionSummary[];
  frequencyByHour?: ActionFrequencyByHour[];
  recentLogs?: RecentAuditLog[];
}

export default function AuditLogInsightsComponent({
  actionsSummary,
  frequencyByHour,
  recentLogs,
}: Props) {
  const t = useTranslations('infrastructure-analytics');

  const chartConfig = useMemo(() => {
    return {
      action_count: {
        label: t('audit.actions'),
        color: 'hsl(217, 91%, 60%)',
      },
    };
  }, [t]);

  const topActions = useMemo(() => {
    return actionsSummary.slice(0, 10);
  }, [actionsSummary]);

  const hourlyData = useMemo(() => {
    if (!frequencyByHour) return [];

    // Create array with all hours (0-23)
    const allHours = Array.from({ length: 24 }, (_, hour) => {
      const hourData = frequencyByHour.find((d) => d.hour_of_day === hour);
      return {
        hour_of_day: hour,
        action_count: hourData?.action_count || 0,
        displayHour: `${hour}:00`,
      };
    });

    return allHours;
  }, [frequencyByHour]);

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Top Actions Summary */}
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="font-semibold text-lg">{t('audit.top-actions')}</h3>
          <p className="text-muted-foreground text-sm">
            {t('audit.top-actions-description')}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {topActions.map((action, idx) => (
            <div
              key={action.action}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 font-bold text-primary">
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <p className="font-medium">{action.action}</p>
                  <div className="mt-1 flex items-center gap-3 text-muted-foreground text-xs">
                    <span className="flex items-center gap-1">
                      <Activity className="h-3 w-3" />
                      {action.action_count.toLocaleString()} {t('audit.times')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {action.unique_users.toLocaleString()} {t('audit.users')}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right text-muted-foreground text-xs">
                <Clock className="mx-auto mb-1 h-4 w-4" />
                {new Date(action.last_occurrence).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Activity by Hour */}
      {hourlyData.length > 0 && (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="font-semibold text-lg">
              {t('audit.activity-by-hour')}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t('audit.activity-by-hour-description')}
            </p>
          </div>

          <ChartContainer config={chartConfig} className="h-80 w-full">
            <BarChart
              data={hourlyData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="displayHour"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="action_count"
                fill="var(--color-action_count)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </div>
      )}

      {/* Recent Activity Log */}
      {recentLogs && recentLogs.length > 0 && (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="font-semibold text-lg">
              {t('audit.recent-activity')}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t('audit.recent-activity-description')}
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-sm">
                    {t('audit.action')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-sm">
                    {t('audit.user')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-sm">
                    {t('audit.type')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-sm">
                    {t('audit.ip-address')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-sm">
                    {t('audit.time')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentLogs.slice(0, 20).map((log) => (
                  <tr
                    key={log.id}
                    className="transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm">{log.action}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm">
                        {log.actor_username || t('audit.unknown')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-primary text-xs">
                        {log.log_type || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-muted-foreground text-xs">
                        {log.ip_address === '::1'
                          ? 'localhost'
                          : log.ip_address}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-sm">
                      {new Date(log.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
