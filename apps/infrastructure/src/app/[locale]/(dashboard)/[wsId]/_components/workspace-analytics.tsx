'use client';

import { Building2, TrendingUp, Users } from '@tuturuuu/icons';
import type {
  WorkspaceMemberDistribution,
  WorkspaceStatistics,
} from '@tuturuuu/types';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';

interface Props {
  statistics: WorkspaceStatistics;
  distribution: WorkspaceMemberDistribution[];
}

const COLORS = [
  'hsl(217, 91%, 60%)',
  'hsl(142, 76%, 36%)',
  'hsl(262, 83%, 58%)',
  'hsl(24, 95%, 53%)',
  'hsl(340, 82%, 52%)',
  'hsl(199, 89%, 48%)',
  'hsl(48, 96%, 53%)',
];

export default function WorkspaceAnalyticsComponent({
  statistics,
  distribution,
}: Props) {
  const t = useTranslations('infrastructure-analytics');

  const chartConfig = useMemo(() => {
    return {
      workspace_count: {
        label: t('workspaces.count'),
        color: 'hsl(217, 91%, 60%)',
      },
    };
  }, [t]);

  const sortedDistribution = useMemo(() => {
    const order = [
      '0 members',
      '1 member',
      '2-5 members',
      '6-10 members',
      '11-25 members',
      '26-50 members',
      '50+ members',
    ];
    return [...distribution].sort(
      (a, b) => order.indexOf(a.member_range) - order.indexOf(b.member_range)
    );
  }, [distribution]);

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('workspaces.total')}
          value={statistics.total_workspaces.toLocaleString()}
          icon={<Building2 className="h-5 w-5 text-dynamic-blue" />}
        />
        <StatCard
          title={t('workspaces.active')}
          value={statistics.active_workspaces.toLocaleString()}
          icon={<Building2 className="h-5 w-5 text-dynamic-green" />}
        />
        <StatCard
          title={t('workspaces.avg-members')}
          value={statistics.avg_members_per_workspace.toFixed(1)}
          icon={<Users className="h-5 w-5 text-dynamic-purple" />}
        />
        <StatCard
          title={t('workspaces.median-members')}
          value={statistics.median_members_per_workspace.toFixed(1)}
          icon={<Users className="h-5 w-5 text-dynamic-yellow" />}
        />
        <StatCard
          title={t('workspaces.empty-workspaces')}
          value={statistics.empty_workspace_count.toLocaleString()}
          icon={<Building2 className="h-5 w-5 text-dynamic-red" />}
        />
        <StatCard
          title={t('workspaces.created-today')}
          value={statistics.workspaces_created_today.toLocaleString()}
          icon={<TrendingUp className="h-5 w-5 text-dynamic-orange" />}
        />
        <StatCard
          title={t('workspaces.created-this-week')}
          value={statistics.workspaces_created_this_week.toLocaleString()}
          icon={<TrendingUp className="h-5 w-5 text-dynamic-cyan" />}
        />
        <StatCard
          title={t('workspaces.created-this-month')}
          value={statistics.workspaces_created_this_month.toLocaleString()}
          icon={<TrendingUp className="h-5 w-5 text-dynamic-pink" />}
        />
      </div>

      {/* Member Distribution */}
      {sortedDistribution.length > 0 && (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="font-semibold text-lg">
              {t('workspaces.member-distribution')}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t('workspaces.member-distribution-description')}
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Bar Chart */}
            <ChartContainer config={chartConfig} className="h-80 w-full">
              <BarChart
                data={sortedDistribution}
                margin={{ top: 10, right: 10, left: 0, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="member_range"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="workspace_count"
                  fill="var(--color-workspace_count)"
                  radius={[8, 8, 0, 0]}
                >
                  {sortedDistribution.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>

            {/* Distribution List */}
            <div className="space-y-3">
              {sortedDistribution.map((item, idx) => (
                <div
                  key={item.member_range}
                  className="rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-10 w-10 rounded-lg"
                        style={{
                          backgroundColor: `${COLORS[idx % COLORS.length]}20`,
                          border: `2px solid ${COLORS[idx % COLORS.length]}`,
                        }}
                      />
                      <div>
                        <p className="font-medium">{item.member_range}</p>
                        <p className="text-muted-foreground text-sm">
                          {item.workspace_count.toLocaleString()}{' '}
                          {t('workspaces.workspaces')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-lg">
                        {item.percentage}%
                      </p>
                    </div>
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
