'use client';

import { Activity, Clock, Monitor, Smartphone, Tablet } from '@tuturuuu/icons';
import type { SessionByDevice, SessionStatistics } from '@tuturuuu/types';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Cell, Pie, PieChart } from 'recharts';

interface Props {
  statistics: SessionStatistics;
  deviceStats: SessionByDevice[];
}

const DEFAULT_COLOR = 'hsl(0, 0%, 50%)';

const DEVICE_COLORS: Record<string, string> = {
  Mobile: 'hsl(142, 76%, 36%)',
  Desktop: 'hsl(217, 91%, 60%)',
  Tablet: 'hsl(262, 83%, 58%)',
  Bot: 'hsl(24, 95%, 53%)',
  Unknown: DEFAULT_COLOR,
};

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  Mobile: <Smartphone className="h-5 w-5" />,
  Desktop: <Monitor className="h-5 w-5" />,
  Tablet: <Tablet className="h-5 w-5" />,
  Bot: <Activity className="h-5 w-5" />,
  Unknown: <Activity className="h-5 w-5" />,
};

export default function SessionAnalyticsComponent({
  statistics,
  deviceStats,
}: Props) {
  const t = useTranslations('infrastructure-analytics');

  const deviceChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    deviceStats.forEach((device) => {
      config[device.device_type] = {
        label: device.device_type,
        color: DEVICE_COLORS[device.device_type] || DEFAULT_COLOR,
      };
    });
    return config;
  }, [deviceStats]);

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Session Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('sessions.total')}
          value={statistics.total_sessions.toLocaleString()}
          icon={<Activity className="h-5 w-5 text-dynamic-blue" />}
        />
        <StatCard
          title={t('sessions.active')}
          value={statistics.active_sessions.toLocaleString()}
          icon={<Activity className="h-5 w-5 text-dynamic-green" />}
        />
        <StatCard
          title={t('sessions.avg-duration')}
          value={`${statistics.avg_session_duration_hours.toFixed(1)}h`}
          icon={<Clock className="h-5 w-5 text-dynamic-purple" />}
        />
        <StatCard
          title={t('sessions.median-duration')}
          value={`${statistics.median_session_duration_minutes.toFixed(1)}m`}
          icon={<Clock className="h-5 w-5 text-dynamic-yellow" />}
        />
        <StatCard
          title={t('sessions.today')}
          value={statistics.sessions_today.toLocaleString()}
          icon={<Activity className="h-5 w-5 text-dynamic-orange" />}
        />
        <StatCard
          title={t('sessions.this-week')}
          value={statistics.sessions_this_week.toLocaleString()}
          icon={<Activity className="h-5 w-5 text-dynamic-cyan" />}
        />
        <StatCard
          title={t('sessions.this-month')}
          value={statistics.sessions_this_month.toLocaleString()}
          icon={<Activity className="h-5 w-5 text-dynamic-pink" />}
        />
      </div>

      {/* Device Distribution */}
      {deviceStats.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Pie Chart */}
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="font-semibold text-lg">
                {t('sessions.device-distribution')}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t('sessions.device-distribution-description')}
              </p>
            </div>

            <ChartContainer config={deviceChartConfig} className="h-64 w-full">
              <PieChart>
                <Pie
                  data={deviceStats.map((stat) => ({
                    ...stat,
                    name: stat.device_type,
                    value: stat.session_count,
                  }))}
                  dataKey="session_count"
                  nameKey="device_type"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) =>
                    `${name}: ${((percent ?? 0) * 100).toFixed(1)}%`
                  }
                >
                  {deviceStats.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={DEVICE_COLORS[entry.device_type] || DEFAULT_COLOR}
                    />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
              </PieChart>
            </ChartContainer>
          </div>

          {/* Device List */}
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="font-semibold text-lg">
                {t('sessions.device-breakdown')}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t('sessions.device-breakdown-description')}
              </p>
            </div>

            <div className="space-y-3">
              {deviceStats.map((device) => (
                <div
                  key={device.device_type}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="rounded-lg p-2"
                      style={{
                        backgroundColor: `${DEVICE_COLORS[device.device_type] || DEFAULT_COLOR}20`,
                      }}
                    >
                      {DEVICE_ICONS[device.device_type] || DEVICE_ICONS.Unknown}
                    </div>
                    <div>
                      <p className="font-medium">{device.device_type}</p>
                      <p className="text-muted-foreground text-sm">
                        {device.session_count.toLocaleString()}{' '}
                        {t('sessions.sessions')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-lg">
                      {device.percentage}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-muted p-2">{icon}</div>
        <div className="flex-1">
          <p className="font-medium text-muted-foreground text-sm">{title}</p>
          <p className="mt-1 font-bold text-2xl">{value}</p>
        </div>
      </div>
    </div>
  );
}
