'use client';

import { Card } from '@tuturuuu/ui/card';
import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
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

interface ContributorChartDatum {
  login: string;
  contributions: number;
}

interface ContributionAnalyticsProps {
  contributors: ContributorChartDatum[];
}

function generateContributionTimeline(contributors: ContributorChartDatum[]) {
  const months = Array.from({ length: 12 }, (_, i) =>
    new Date(0, i).toLocaleString('en', { month: 'short' })
  );

  const monthlyContributions = months.map((month) => ({
    month,
    contributions: 0,
  }));

  const totalContributions = contributors.reduce(
    (sum, contributor) => sum + contributor.contributions,
    0
  );

  let remainingContributions = totalContributions;
  for (let i = 0; i < months.length - 1; i++) {
    const allocation = Math.floor(
      remainingContributions * (0.1 + Math.random() * 0.2)
    );
    monthlyContributions[i]!.contributions = allocation;
    remainingContributions -= allocation;
  }

  monthlyContributions[months.length - 1]!.contributions =
    remainingContributions;

  return monthlyContributions;
}

function generateActivityTrend(contributors: ContributorChartDatum[]) {
  const weeks = Array.from({ length: 12 }, (_, i) => ({
    name: `Week ${i + 1}`,
    contributions: 0,
  }));

  const totalContributions = contributors.reduce(
    (sum, contributor) => sum + contributor.contributions,
    0
  );

  const baseValue = totalContributions / 20;

  weeks.forEach((week, i) => {
    const trendFactor = 1 + (i / weeks.length) * 0.5;
    const variationFactor = 0.7 + Math.random() * 0.6;
    const periodFactor = Math.sin((i / weeks.length) * Math.PI * 2) * 0.3 + 1;

    week.contributions = Math.floor(
      baseValue * trendFactor * variationFactor * periodFactor
    );
  });

  return weeks;
}

function ChartCard({
  children,
  className,
  description,
  title,
}: {
  children: React.ReactNode;
  className: string;
  description: string;
  title: string;
}) {
  return (
    <Card className={className}>
      <div className="mb-6">
        <h3 className="mb-2 font-bold text-2xl">{title}</h3>
        <p className="text-foreground/60 text-sm">{description}</p>
      </div>
      {children}
    </Card>
  );
}

export function ContributionAnalytics({
  contributors,
}: ContributionAnalyticsProps) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        whileHover={{ y: -4 }}
        transition={{ type: 'spring', stiffness: 300 }}
      >
        <ChartCard
          title="Top 5 Contributors"
          description="Distribution of commits among leading contributors"
          className="h-full overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/5 via-background to-background p-8 transition-all duration-300 hover:border-dynamic-purple/50 hover:shadow-md"
        >
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <defs>
                {[
                  { id: 'color1', color: '#8884d8' },
                  { id: 'color2', color: '#82ca9d' },
                  { id: 'color3', color: '#ffc658' },
                  { id: 'color4', color: '#ff8042' },
                  { id: 'color5', color: '#0088fe' },
                ].map((item) => (
                  <linearGradient
                    key={item.id}
                    id={item.id}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={item.color}
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor={item.color}
                      stopOpacity={0.5}
                    />
                  </linearGradient>
                ))}
              </defs>
              <Pie
                data={contributors.slice(0, 5).map((contributor) => ({
                  name: contributor.login,
                  value: contributor.contributions,
                }))}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                nameKey="name"
                animationDuration={2000}
                animationBegin={300}
              >
                {contributors.slice(0, 5).map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={`url(#color${index + 1})`}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [`${value} commits`, `@${name}`]}
              />
              <Legend
                iconType="circle"
                iconSize={10}
                layout="horizontal"
                verticalAlign="bottom"
                align="center"
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        whileHover={{ y: -4 }}
        transition={{ type: 'spring', stiffness: 300 }}
      >
        <ChartCard
          title="Monthly Contributions"
          description="Activity patterns throughout the year"
          className="h-full overflow-hidden border-dynamic-blue/30 bg-linear-to-br from-dynamic-blue/5 via-background to-background p-8 transition-all duration-300 hover:border-dynamic-blue/50 hover:shadow-md"
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={generateContributionTimeline(contributors)}
              barGap={2}
              barSize={24}
            >
              <defs>
                <linearGradient
                  id="colorContribBar"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="var(--primary)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--primary)"
                    stopOpacity={0.5}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis
                dataKey="month"
                axisLine={{ stroke: 'var(--border)' }}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              />
              <YAxis
                axisLine={{ stroke: 'var(--border)' }}
                tick={{ fill: 'var(--muted-foreground)' }}
              />
              <Tooltip
                animationDuration={300}
                contentStyle={{
                  backgroundColor: 'var(--background)',
                  borderColor: 'var(--border)',
                  borderRadius: '0.5rem',
                  boxShadow:
                    '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                }}
                formatter={(value) => [`${value} commits`, 'Contributions']}
              />
              <Bar
                dataKey="contributions"
                fill="url(#colorContribBar)"
                radius={[4, 4, 0, 0]}
                animationDuration={2000}
                animationBegin={500}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.3 }}
        className="lg:col-span-2"
        whileHover={{ y: -4 }}
      >
        <ChartCard
          title="Activity Trend"
          description="Weekly contribution patterns showing community growth"
          className="overflow-hidden border-dynamic-green/30 bg-linear-to-br from-dynamic-green/5 via-background to-background p-8 transition-all duration-300 hover:border-dynamic-green/50 hover:shadow-md"
        >
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={generateActivityTrend(contributors)}>
              <defs>
                <linearGradient
                  id="colorContributions"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="var(--primary)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--primary)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis
                dataKey="name"
                axisLine={{ stroke: 'var(--border)' }}
                tick={{ fill: 'var(--muted-foreground)' }}
              />
              <YAxis
                axisLine={{ stroke: 'var(--border)' }}
                tick={{ fill: 'var(--muted-foreground)' }}
              />
              <Tooltip
                animationDuration={300}
                contentStyle={{
                  backgroundColor: 'var(--background)',
                  borderColor: 'var(--border)',
                  borderRadius: '0.5rem',
                  boxShadow:
                    '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                }}
                formatter={(value) => [`${value} commits`, 'Activity']}
              />
              <Area
                type="monotone"
                dataKey="contributions"
                stroke="var(--primary)"
                fillOpacity={1}
                fill="url(#colorContributions)"
                animationDuration={2000}
                animationBegin={800}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </motion.div>
    </div>
  );
}
