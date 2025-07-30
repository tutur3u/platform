'use client';

import type {
  AIExecutionDailyStats,
  AIExecutionModelStats,
  AIExecutionSummary,
} from '../services/analytics-service';
import { calculateCost, formatCost } from '../utils/cost-calculator';
import type { WorkspaceAIExecution } from '@tuturuuu/types/db';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { BarChart3, DollarSign, TrendingUp, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface ExecutionChartsProps {
  executions: WorkspaceAIExecution[];
  isLoading?: boolean;
  analyticsData?: {
    summary: AIExecutionSummary | null;
    dailyStats: AIExecutionDailyStats[];
    modelStats: AIExecutionModelStats[];
  };
}

const COLORS = {
  light: {
    primary: '#3b82f6',
    success: '#22c55e',
    warning: '#f59e0b',
    info: '#06b6d4',
    grid: '#e5e7eb',
    axis: '#4b5563',
    tooltip: {
      bg: '#ffffff',
      border: '#e5e7eb',
      text: '#1f2937',
    },
  },
  dark: {
    primary: '#60a5fa',
    success: '#4ade80',
    warning: '#fbbf24',
    info: '#22d3ee',
    grid: '#374151',
    axis: '#9ca3af',
    tooltip: {
      bg: '#1f2937',
      border: '#374151',
      text: '#f3f4f6',
    },
  },
};

export function ExecutionCharts({
  executions,
  isLoading = false,
  analyticsData,
}: ExecutionChartsProps) {
  const t = useTranslations('ai-execution-charts');
  const { resolvedTheme } = useTheme();
  const colors = resolvedTheme === 'dark' ? COLORS.dark : COLORS.light;

  // Process data for charts - use analytics data if available, otherwise process from executions
  const processChartData = () => {
    // Use analytics data if available
    if (analyticsData?.dailyStats && analyticsData?.modelStats) {
      const dailyData = analyticsData.dailyStats.map((stat) => ({
        date: stat.date,
        executions: stat.executions,
        totalCost: stat.total_cost_usd,
        totalTokens: stat.total_tokens,
        inputTokens: stat.input_tokens,
        outputTokens: stat.output_tokens,
        reasoningTokens: stat.reasoning_tokens,
      }));

      const modelData = analyticsData.modelStats.map((stat) => ({
        model: stat.model_id,
        executions: stat.executions,
        totalCost: stat.total_cost_usd,
        totalTokens: stat.total_tokens,
      }));

      return { dailyData, modelData };
    }

    // Fallback to processing from executions
    const dailyData = new Map<
      string,
      {
        date: string;
        executions: number;
        totalCost: number;
        totalTokens: number;
        inputTokens: number;
        outputTokens: number;
        reasoningTokens: number;
      }
    >();

    const modelData = new Map<
      string,
      {
        model: string;
        executions: number;
        totalCost: number;
        totalTokens: number;
      }
    >();

    executions.forEach((execution) => {
      const date = new Date(execution.created_at).toISOString().split('T')[0];
      if (!date) return;

      const cost = calculateCost(execution.model_id, {
        inputTokens: execution.input_tokens,
        outputTokens: execution.output_tokens,
        reasoningTokens: execution.reasoning_tokens,
        totalTokens: execution.total_tokens,
      });

      // Daily data
      const existingDaily = dailyData.get(date) || {
        date,
        executions: 0,
        totalCost: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
      };

      dailyData.set(date, {
        ...existingDaily,
        executions: existingDaily.executions + 1,
        totalCost: existingDaily.totalCost + cost.totalCostUSD,
        totalTokens: existingDaily.totalTokens + execution.total_tokens,
        inputTokens: existingDaily.inputTokens + execution.input_tokens,
        outputTokens: existingDaily.outputTokens + execution.output_tokens,
        reasoningTokens:
          existingDaily.reasoningTokens + execution.reasoning_tokens,
      });

      // Model data
      const existingModel = modelData.get(execution.model_id) || {
        model: execution.model_id,
        executions: 0,
        totalCost: 0,
        totalTokens: 0,
      };
      modelData.set(execution.model_id, {
        ...existingModel,
        executions: existingModel.executions + 1,
        totalCost: existingModel.totalCost + cost.totalCostUSD,
        totalTokens: existingModel.totalTokens + execution.total_tokens,
      });
    });

    return {
      dailyData: Array.from(dailyData.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
      modelData: Array.from(modelData.values()),
    };
  };

  const { dailyData, modelData } = processChartData();

  const pieChartData = modelData.map((item) => ({
    name: item.model,
    value: item.executions,
  }));

  const costChartData = dailyData.map((item) => ({
    date: item.date,
    cost: item.totalCost,
    executions: item.executions,
  }));

  const tokenChartData = dailyData.map((item) => ({
    date: item.date,
    input: item.inputTokens,
    output: item.outputTokens,
    reasoning: item.reasoningTokens,
  }));

  // Use analytics data for totals if available, otherwise calculate from current executions
  const totalCost =
    analyticsData?.summary?.total_cost_usd ??
    executions.reduce((sum, execution) => {
      const cost = calculateCost(execution.model_id, {
        inputTokens: execution.input_tokens,
        outputTokens: execution.output_tokens,
        reasoningTokens: execution.reasoning_tokens,
        totalTokens: execution.total_tokens,
      });
      return sum + cost.totalCostUSD;
    }, 0);

  const totalTokens =
    analyticsData?.summary?.total_tokens ??
    executions.reduce((sum, execution) => sum + execution.total_tokens, 0);

  const totalExecutions =
    analyticsData?.summary?.total_executions ?? executions.length;

  // Empty state component
  const EmptyState = ({
    title,
    description,
  }: {
    title: string;
    description: string;
  }) => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <BarChart3 className="mb-4 h-12 w-12 text-muted-foreground/50" />
      <h3 className="mb-2 text-lg font-semibold text-muted-foreground">
        {title}
      </h3>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <div className="mb-2 h-6 w-32 animate-pulse rounded bg-muted" />
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent>
            <div className="h-[400px] animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <EmptyState
        title={t('no_data_title') || 'No Data Available'}
        description={
          t('no_data_description') ||
          'No AI executions found. Start using AI features to see analytics here.'
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Zap className="h-4 w-4 text-primary" />
              {t('total_executions') || 'Total Executions'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalExecutions.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('total_executions_description') ||
                'Total number of AI executions'}
            </p>
          </CardContent>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent" />
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <DollarSign className="text-success h-4 w-4" />
              {t('total_cost') || 'Total Cost'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCost(totalCost)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatCost(totalCost * 26000, 'VND')}
            </p>
          </CardContent>
          <div className="from-success/5 pointer-events-none absolute inset-0 bg-gradient-to-r to-transparent" />
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="text-warning h-4 w-4" />
              {t('total_tokens') || 'Total Tokens'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalTokens.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('total_tokens_description') ||
                'Total tokens processed across all executions'}
            </p>
          </CardContent>
          <div className="from-warning/5 pointer-events-none absolute inset-0 bg-gradient-to-r to-transparent" />
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="cost" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="cost" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            {t('cost_trends')}
          </TabsTrigger>
          <TabsTrigger value="tokens" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            {t('token_usage')}
          </TabsTrigger>
          <TabsTrigger value="models" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            {t('model_distribution')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cost" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="text-success h-5 w-5" />
                {t('daily_cost_trend')}
              </CardTitle>
              <CardDescription>{t('cost_trend_description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {costChartData.length === 0 ? (
                <EmptyState
                  title={t('no_cost_data_title') || 'No Cost Data'}
                  description={
                    t('no_cost_data_description') ||
                    'No cost data available for the selected time period.'
                  }
                />
              ) : (
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={costChartData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={colors.grid}
                      />
                      <XAxis
                        dataKey="date"
                        stroke={colors.axis}
                        tick={{ fill: colors.axis, fontSize: 12 }}
                        tickFormatter={(value) =>
                          new Date(value).toLocaleDateString()
                        }
                      />
                      <YAxis
                        stroke={colors.axis}
                        tick={{ fill: colors.axis, fontSize: 12 }}
                        tickFormatter={(value) => formatCost(value)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: colors.tooltip.bg,
                          border: `1px solid ${colors.tooltip.border}`,
                          color: colors.tooltip.text,
                        }}
                        formatter={(value: number) => [
                          formatCost(value),
                          t('cost'),
                        ]}
                        labelFormatter={(value) =>
                          new Date(value).toLocaleDateString()
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="cost"
                        stroke={colors.success}
                        strokeWidth={3}
                        name={t('cost')}
                        dot={{ fill: colors.success, strokeWidth: 2, r: 4 }}
                        activeDot={{
                          r: 6,
                          stroke: colors.success,
                          strokeWidth: 2,
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tokens" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                {t('daily_token_usage')}
              </CardTitle>
              <CardDescription>{t('token_usage_description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {tokenChartData.length === 0 ? (
                <EmptyState
                  title={t('no_token_data_title') || 'No Token Data'}
                  description={
                    t('no_token_data_description') ||
                    'No token usage data available for the selected time period.'
                  }
                />
              ) : (
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tokenChartData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={colors.grid}
                      />
                      <XAxis
                        dataKey="date"
                        stroke={colors.axis}
                        tick={{ fill: colors.axis, fontSize: 12 }}
                        tickFormatter={(value) =>
                          new Date(value).toLocaleDateString()
                        }
                      />
                      <YAxis
                        stroke={colors.axis}
                        tick={{ fill: colors.axis, fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: colors.tooltip.bg,
                          border: `1px solid ${colors.tooltip.border}`,
                          color: colors.tooltip.text,
                        }}
                        labelFormatter={(value) =>
                          new Date(value).toLocaleDateString()
                        }
                      />
                      <Legend />
                      <Bar
                        dataKey="input"
                        fill={colors.primary}
                        name={t('input_tokens')}
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="output"
                        fill={colors.success}
                        name={t('output_tokens')}
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="reasoning"
                        fill={colors.warning}
                        name={t('reasoning_tokens')}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="models" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="text-info h-5 w-5" />
                {t('model_usage_distribution')}
              </CardTitle>
              <CardDescription>
                {t('model_distribution_description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pieChartData.length === 0 ? (
                <EmptyState
                  title={t('no_model_data_title') || 'No Model Data'}
                  description={
                    t('no_model_data_description') ||
                    'No model usage data available for the selected time period.'
                  }
                />
              ) : (
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={120}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) =>
                          `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                      >
                        {pieChartData.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              [
                                colors.primary,
                                colors.success,
                                colors.warning,
                                colors.info,
                              ][index % 4]
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
