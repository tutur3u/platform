'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import type { useTranslations } from 'next-intl';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { FormAnalytics } from '../types';
import { ChartTooltipContent } from './chart-tooltip-content';

export function renderEngagementCard({
  t,
  analytics,
  activityChartData,
}: {
  t: ReturnType<typeof useTranslations<'forms'>>;
  analytics: FormAnalytics;
  activityChartData: Array<
    FormAnalytics['activity'][number] & { shortDate: string }
  >;
}) {
  return (
    <Card className="overflow-hidden border-border/60 bg-card/80 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {t('analytics.engagement_over_time')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activityChartData.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-10 text-center text-muted-foreground text-sm">
            {t('analytics.no_data')}
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                {
                  label: t('analytics.views'),
                  value: analytics.totalViews,
                  accent: 'text-dynamic-blue',
                },
                {
                  label: t('analytics.starts'),
                  value: analytics.totalStarts,
                  accent: 'text-dynamic-green',
                },
                {
                  label: t('analytics.submissions'),
                  value: analytics.totalSubmissions,
                  accent: 'text-dynamic-orange',
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-border/60 bg-background/50 px-4 py-3"
                >
                  <p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
                    {item.label}
                  </p>
                  <p className={cn('mt-1 font-semibold text-lg', item.accent)}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityChartData}>
                  <defs>
                    <linearGradient
                      id="forms-views"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#3b82f6"
                        stopOpacity={0.22}
                      />
                      <stop
                        offset="95%"
                        stopColor="#3b82f6"
                        stopOpacity={0.03}
                      />
                    </linearGradient>
                    <linearGradient
                      id="forms-starts"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                      <stop
                        offset="95%"
                        stopColor="#22c55e"
                        stopOpacity={0.03}
                      />
                    </linearGradient>
                    <linearGradient
                      id="forms-submissions"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#f97316"
                        stopOpacity={0.18}
                      />
                      <stop
                        offset="95%"
                        stopColor="#f97316"
                        stopOpacity={0.03}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="shortDate"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis tickLine={false} axisLine={false} width={36} />
                  <Tooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value, payload) => {
                          const rawDate = payload?.[0]?.payload?.date;
                          if (typeof rawDate === 'string') {
                            return new Date(rawDate).toLocaleDateString(
                              undefined,
                              {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric',
                              }
                            );
                          }

                          return value;
                        }}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="views"
                    name={t('analytics.views')}
                    stroke="#3b82f6"
                    fill="url(#forms-views)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="starts"
                    name={t('analytics.starts')}
                    stroke="#22c55e"
                    fill="url(#forms-starts)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="submissions"
                    name={t('analytics.submissions')}
                    stroke="#f97316"
                    fill="url(#forms-submissions)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
