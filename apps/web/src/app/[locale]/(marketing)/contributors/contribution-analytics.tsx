'use client';

import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * Charts of what the repository actually reports.
 *
 * The version this replaces drew three charts, two of which — "Monthly
 * Contributions" and "Activity Trend" — were produced by `Math.random()` and
 * presented as GitHub data. They also re-rolled on every render, so the same
 * visitor saw a different "trend" each time. Both are gone. What remains is
 * derived only from the commit counts the contributors endpoint returns.
 */

interface ContributorChartDatum {
  login: string;
  contributions: number;
}

interface ContributionAnalyticsProps {
  contributors: ContributorChartDatum[];
}

const sliceColors = [
  'var(--purple)',
  'var(--blue)',
  'var(--cyan)',
  'var(--green)',
  'var(--orange)',
];

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-6">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
      />
      <h3 className="font-display font-semibold text-lg tracking-[-0.01em]">
        {title}
      </h3>
      <p className="mt-1.5 text-foreground/45 text-sm">{description}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

const tooltipStyle = {
  background: 'var(--background)',
  border: '1px solid color-mix(in oklab, var(--foreground) 12%, transparent)',
  borderRadius: '0.75rem',
  fontSize: '0.75rem',
};

export function ContributionAnalytics({
  contributors,
}: ContributionAnalyticsProps) {
  const ranked = [...contributors].sort(
    (a, b) => b.contributions - a.contributions
  );
  const topFive = ranked.slice(0, 5);
  const topTwelve = ranked.slice(0, 12);

  if (ranked.length === 0) return null;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ChartCard
        description="Share of commits among the five most active contributors."
        title="Top five by commits"
      >
        <ResponsiveContainer height={260} width="100%">
          <PieChart>
            <Pie
              data={topFive}
              dataKey="contributions"
              innerRadius={58}
              nameKey="login"
              outerRadius={92}
              paddingAngle={2}
              strokeWidth={0}
            >
              {topFive.map((entry, index) => (
                <Cell
                  fill={sliceColors[index % sliceColors.length]}
                  key={entry.login}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value) => [Number(value).toLocaleString(), 'commits']}
            />
          </PieChart>
        </ResponsiveContainer>

        <ul className="mt-4 grid gap-1.5">
          {topFive.map((entry, index) => (
            <li
              className="flex items-center gap-2 text-xs"
              key={`legend-${entry.login}`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{
                  background: sliceColors[index % sliceColors.length],
                }}
              />
              <span className="min-w-0 flex-1 truncate text-foreground/60">
                {entry.login}
              </span>
              <span className="font-mono-ui text-[0.62rem] text-foreground/40 tabular-nums">
                {entry.contributions.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </ChartCard>

      <ChartCard
        description="How commits are spread across the wider group, most active first."
        title="Distribution across the group"
      >
        <ResponsiveContainer height={340} width="100%">
          <BarChart
            data={topTwelve}
            layout="vertical"
            margin={{ left: 8, right: 8 }}
          >
            <XAxis hide type="number" />
            <YAxis
              axisLine={false}
              dataKey="login"
              tick={{
                fill: 'color-mix(in oklab, var(--foreground) 45%, transparent)',
                fontSize: 11,
              }}
              tickLine={false}
              type="category"
              width={92}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{
                fill: 'color-mix(in oklab, var(--foreground) 4%, transparent)',
              }}
              formatter={(value) => [Number(value).toLocaleString(), 'commits']}
            />
            <Bar dataKey="contributions" radius={[0, 4, 4, 0]}>
              {topTwelve.map((entry, index) => (
                <Cell
                  fill={sliceColors[index % sliceColors.length]}
                  key={`bar-${entry.login}`}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
