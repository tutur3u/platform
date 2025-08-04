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
import {
  Activity,
  BarChart3,
  Clock,
  DollarSign,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface PerformanceMetricsProps {
  executions: WorkspaceAIExecution[];
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
    danger: '#ef4444',
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
    danger: '#f87171',
    grid: '#374151',
    axis: '#9ca3af',
    tooltip: {
      bg: '#1f2937',
      border: '#374151',
      text: '#f3f4f6',
    },
  },
};

export function PerformanceMetrics({
  executions,
  analyticsData,
}: PerformanceMetricsProps) {
  const t = useTranslations('ai-execution-charts');
  const { resolvedTheme } = useTheme();
  const colors = resolvedTheme === 'dark' ? COLORS.dark : COLORS.light;

  // Process data for charts
  const processChartData = () => {
    if (analyticsData?.dailyStats && analyticsData?.modelStats) {
      const dailyData = analyticsData.dailyStats.map((stat) => ({
        date: stat.date,
        executions: stat.executions,
        totalCost: stat.total_cost_usd,
        totalTokens: stat.total_tokens,
        inputTokens: stat.input_tokens,
        outputTokens: stat.output_tokens,
        reasoningTokens: stat.reasoning_tokens,
        avgCostPerExecution: stat.total_cost_usd / stat.executions,
        avgTokensPerExecution: stat.total_tokens / stat.executions,
      }));

      const modelData = analyticsData.modelStats.map((stat) => ({
        name: stat.model_id,
        executions: stat.executions,
        totalCost: stat.total_cost_usd,
        avgCostPerExecution: stat.avg_cost_per_execution,
        avgTokensPerExecution: stat.avg_tokens_per_execution,
        percentageOfTotal: stat.percentage_of_total,
      }));

      return { dailyData, modelData };
    }

    // Fallback processing from executions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dailyData = new Map<string, any>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modelData = new Map<string, any>();

    executions.forEach((execution) => {
      const date = new Date(execution.created_at).toISOString().split('T')[0];
      if (!date) return;

      const cost = calculateCost(execution.model_id, {
        inputTokens: execution.input_tokens,
        outputTokens: execution.output_tokens,
        reasoningTokens: execution.reasoning_tokens,
        totalTokens: execution.total_tokens,
      });

      // Daily data aggregation
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

      // Model data aggregation
      const existingModel = modelData.get(execution.model_id) || {
        name: execution.model_id,
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

    // Calculate averages for daily data
    const processedDailyData = Array.from(dailyData.values()).map((item) => ({
      ...item,
      avgCostPerExecution: item.totalCost / item.executions,
      avgTokensPerExecution: item.totalTokens / item.executions,
    }));

    // Calculate averages and percentages for model data
    const totalCost = Array.from(modelData.values()).reduce(
      (sum, item) => sum + item.totalCost,
      0
    );
    const processedModelData = Array.from(modelData.values()).map((item) => ({
      ...item,
      avgCostPerExecution: item.totalCost / item.executions,
      avgTokensPerExecution: item.totalTokens / item.executions,
      percentageOfTotal: (item.totalCost / totalCost) * 100,
    }));

    return {
      dailyData: processedDailyData.sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
      modelData: processedModelData,
    };
  };

  const { dailyData, modelData } = processChartData();

  // Calculate performance metrics
  const calculatePerformanceMetrics = () => {
    if (dailyData.length === 0) return null;

    const totalExecutions = dailyData.reduce(
      (sum, day) => sum + day.executions,
      0
    );
    const totalCost = dailyData.reduce((sum, day) => sum + day.totalCost, 0);
    const totalTokens = dailyData.reduce(
      (sum, day) => sum + day.totalTokens,
      0
    );

    const avgExecutionsPerDay = totalExecutions / dailyData.length;
    const avgCostPerDay = totalCost / dailyData.length;
    const avgTokensPerDay = totalTokens / dailyData.length;

    // Calculate efficiency metrics
    const avgCostPerExecution =
      totalExecutions > 0 ? totalCost / totalExecutions : 0;
    const avgTokensPerExecution =
      totalExecutions > 0 ? totalTokens / totalExecutions : 0;

    // Calculate trends (last 7 days vs previous 7 days)
    const recent = dailyData.slice(-7);
    const previous = dailyData.slice(-14, -7);

    const recentAvg =
      recent.reduce((sum, day) => sum + day.totalCost, 0) / recent.length;
    const previousAvg =
      previous.reduce((sum, day) => sum + day.totalCost, 0) / previous.length;

    const costTrend =
      previousAvg > 0 ? ((recentAvg - previousAvg) / previousAvg) * 100 : 0;

    return {
      totalExecutions,
      totalCost,
      totalTokens,
      avgExecutionsPerDay,
      avgCostPerDay,
      avgTokensPerDay,
      avgCostPerExecution,
      avgTokensPerExecution,
      costTrend,
    };
  };

  const metrics = calculatePerformanceMetrics();

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
      <div className="grid gap-4 md:grid-cols-4">
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

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Clock className="text-info h-4 w-4" />
              {t('avg_per_execution')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCost(
                totalExecutions > 0 ? totalCost / totalExecutions : 0
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {totalExecutions > 0
                ? (totalTokens / totalExecutions).toLocaleString()
                : '0'}{' '}
              {t('tokens')}
            </p>
          </CardContent>
          <div className="from-info/5 pointer-events-none absolute inset-0 bg-gradient-to-r to-transparent" />
        </Card>
      </div>

      {/* Performance Metrics Summary */}
      {metrics && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Activity className="h-4 w-4 text-primary" />
                Daily Average
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics.avgExecutionsPerDay.toFixed(1)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                executions per day
              </p>
            </CardContent>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent" />
          </Card>

          <Card className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <DollarSign className="text-success h-4 w-4" />
                Daily Cost
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCost(metrics.avgCostPerDay)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                average daily spending
              </p>
            </CardContent>
            <div className="from-success/5 pointer-events-none absolute inset-0 bg-gradient-to-r to-transparent" />
          </Card>

          <Card className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <TrendingUp className="text-warning h-4 w-4" />
                Efficiency
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCost(metrics.avgCostPerExecution)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                per execution
              </p>
            </CardContent>
            <div className="from-warning/5 pointer-events-none absolute inset-0 bg-gradient-to-r to-transparent" />
          </Card>

          <Card className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Clock className="text-info h-4 w-4" />
                Cost Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${metrics.costTrend > 0 ? 'text-danger' : 'text-success'}`}
              >
                {metrics.costTrend > 0 ? '+' : ''}
                {metrics.costTrend.toFixed(1)}%
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                vs previous week
              </p>
            </CardContent>
            <div className="from-info/5 pointer-events-none absolute inset-0 bg-gradient-to-r to-transparent" />
          </Card>
        </div>
      )}

      {/* Interactive Charts */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            {t('overview')}
          </TabsTrigger>
          <TabsTrigger value="efficiency" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            {t('token_analysis')}
          </TabsTrigger>
          <TabsTrigger value="models" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            {t('model_analysis')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="text-success h-5 w-5" />
                  {t('cost_trend_overview')}
                </CardTitle>
                <CardDescription>
                  {t('cost_trend_overview_description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {dailyData.length === 0 ? (
                  <EmptyState
                    title="No Cost Data"
                    description="No cost data available for the selected time period."
                  />
                ) : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={dailyData}>
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
                          yAxisId="left"
                          stroke={colors.axis}
                          tick={{ fill: colors.axis, fontSize: 12 }}
                          tickFormatter={(value) => formatCost(value)}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          stroke={colors.axis}
                          tick={{ fill: colors.axis, fontSize: 12 }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: colors.tooltip.bg,
                            border: `1px solid ${colors.tooltip.border}`,
                            color: colors.tooltip.text,
                          }}
                          formatter={(value: number, name: string) => [
                            name === 'Cost' ? formatCost(value) : value,
                            name,
                          ]}
                          labelFormatter={(value) =>
                            new Date(value).toLocaleDateString()
                          }
                        />
                        <Legend />
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="totalCost"
                          stroke={colors.success}
                          fill={colors.success}
                          fillOpacity={0.1}
                          name="Cost"
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="executions"
                          stroke={colors.primary}
                          strokeWidth={2}
                          name="Executions"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="text-info h-5 w-5" />
                  {t('model_distribution')}
                </CardTitle>
                <CardDescription>
                  {t('model_distribution_description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {modelData.length === 0 ? (
                  <EmptyState
                    title="No Model Data"
                    description="No model usage data available."
                  />
                ) : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={modelData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="executions"
                          label={({ name, percent }) =>
                            `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`
                          }
                        >
                          {modelData.map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={
                                [
                                  colors.primary,
                                  colors.success,
                                  colors.warning,
                                  colors.info,
                                  colors.danger,
                                ][index % 5]
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
          </div>
        </TabsContent>

        <TabsContent value="efficiency" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                {t('detailed_token_analysis')}
              </CardTitle>
              <CardDescription>
                {t('detailed_token_analysis_description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dailyData.length === 0 ? (
                <EmptyState
                  title="No Efficiency Data"
                  description="No efficiency data available for the selected time period."
                />
              ) : (
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dailyData}>
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
                        yAxisId="left"
                        stroke={colors.axis}
                        tick={{ fill: colors.axis, fontSize: 12 }}
                        tickFormatter={(value) => formatCost(value)}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke={colors.axis}
                        tick={{ fill: colors.axis, fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: colors.tooltip.bg,
                          border: `1px solid ${colors.tooltip.border}`,
                          color: colors.tooltip.text,
                        }}
                        formatter={(value: number, name: string) => [
                          name === 'Avg Cost per Execution'
                            ? formatCost(value)
                            : value,
                          name,
                        ]}
                        labelFormatter={(value) =>
                          new Date(value).toLocaleDateString()
                        }
                      />
                      <Legend />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="avgCostPerExecution"
                        stroke={colors.warning}
                        strokeWidth={2}
                        name="Avg Cost per Execution"
                        dot={{ fill: colors.warning, strokeWidth: 2, r: 4 }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="avgTokensPerExecution"
                        stroke={colors.info}
                        strokeWidth={2}
                        name="Avg Tokens per Execution"
                        dot={{ fill: colors.info, strokeWidth: 2, r: 4 }}
                      />
                    </ComposedChart>
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
                <Zap className="text-info h-5 w-5" />
                {t('model_performance_analysis')}
              </CardTitle>
              <CardDescription>
                {t('model_performance_analysis_description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {modelData.length === 0 ? (
                <EmptyState
                  title="No Model Data"
                  description="No model usage data available for the selected time period."
                />
              ) : (
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={modelData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={colors.grid}
                      />
                      <XAxis
                        dataKey="name"
                        stroke={colors.axis}
                        tick={{ fill: colors.axis, fontSize: 12 }}
                      />
                      <YAxis
                        yAxisId="left"
                        stroke={colors.axis}
                        tick={{ fill: colors.axis, fontSize: 12 }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
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
                        formatter={(value: number, name: string) => [
                          name === 'Total Cost' ? formatCost(value) : value,
                          name,
                        ]}
                      />
                      <Legend />
                      <Bar
                        yAxisId="left"
                        dataKey="executions"
                        fill={colors.primary}
                        name="Executions"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        yAxisId="right"
                        dataKey="totalCost"
                        fill={colors.success}
                        name="Total Cost"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
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
