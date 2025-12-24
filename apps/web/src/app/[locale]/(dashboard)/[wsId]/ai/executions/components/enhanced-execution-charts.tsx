'use client';

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Clock,
  DollarSign,
  Info,
  TrendingUp,
  Zap,
} from '@tuturuuu/icons';
import type { WorkspaceAIExecution } from '@tuturuuu/types';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
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
import type {
  AIExecutionDailyStats,
  AIExecutionModelStats,
  AIExecutionSummary,
} from '../services/analytics-service';
import { calculateCost, formatCost } from '../utils/cost-calculator';

interface EnhancedExecutionChartsProps {
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

export function EnhancedExecutionCharts({
  executions,
  isLoading = false,
  analyticsData,
}: EnhancedExecutionChartsProps) {
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
      }));

      const modelData = analyticsData.modelStats.map((stat) => ({
        name: stat.model_id,
        executions: stat.executions,
        totalCost: stat.total_cost_usd,
        avgCostPerExecution: stat.avg_cost_per_execution,
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
    }));

    // Calculate averages and percentages for model data
    const totalCost = Array.from(modelData.values()).reduce(
      (sum, item) => sum + item.totalCost,
      0
    );
    const processedModelData = Array.from(modelData.values()).map((item) => ({
      ...item,
      avgCostPerExecution: item.totalCost / item.executions,
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

  // Calculate trends
  const calculateTrends = () => {
    if (dailyData.length < 2) return null;

    const recent = dailyData.slice(-7);
    const previous = dailyData.slice(-14, -7);

    const recentAvg =
      recent.reduce((sum, day) => sum + day.totalCost, 0) / recent.length;
    const previousAvg =
      previous.reduce((sum, day) => sum + day.totalCost, 0) / previous.length;

    const costTrend = ((recentAvg - previousAvg) / previousAvg) * 100;
    const executionTrend =
      ((recent.reduce((sum, day) => sum + day.executions, 0) -
        previous.reduce((sum, day) => sum + day.executions, 0)) /
        previous.reduce((sum, day) => sum + day.executions, 0)) *
      100;

    return {
      costTrend,
      executionTrend,
      isCostIncreasing: costTrend > 0,
      isExecutionIncreasing: executionTrend > 0,
    };
  };

  const trends = calculateTrends();

  // Performance insights
  const getPerformanceInsights = () => {
    const insights = [];

    if (modelData.length > 0) {
      const mostExpensiveModel = modelData.reduce((max, model) =>
        model.avgCostPerExecution > max.avgCostPerExecution ? model : max
      );

      if (mostExpensiveModel.avgCostPerExecution > 0.01) {
        insights.push({
          type: 'cost' as const,
          title: t('high_cost_model_insight') || 'High Cost Model Detected',
          description:
            t('high_cost_model_description', {
              model: mostExpensiveModel.name,
            }) ||
            `Model ${mostExpensiveModel.name} has the highest average cost per execution.`,
          impact: 'high' as const,
        });
      }
    }

    if (trends && trends.costTrend > 20) {
      insights.push({
        type: 'trend' as const,
        title: t('cost_spike_insight') || 'Cost Spike Detected',
        description:
          t('cost_spike_description') ||
          'Your AI costs have increased significantly in the last 7 days.',
        impact: 'high' as const,
      });
    }

    return insights;
  };

  const insights = getPerformanceInsights();

  // Chart data preparation
  const costChartData = dailyData.map((item) => ({
    date: item.date,
    cost: item.totalCost,
    executions: item.executions,
    avgCostPerExecution: item.avgCostPerExecution,
  }));

  const tokenChartData = dailyData.map((item) => ({
    date: item.date,
    input: item.inputTokens,
    output: item.outputTokens,
    reasoningText: item.reasoningTokens,
  }));

  // Summary calculations
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

  const avgCostPerExecution =
    totalExecutions > 0 ? totalCost / totalExecutions : 0;
  const avgTokensPerExecution =
    totalExecutions > 0 ? totalTokens / totalExecutions : 0;

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
      <h3 className="mb-2 font-semibold text-lg text-muted-foreground">
        {title}
      </h3>
      <p className="max-w-md text-muted-foreground text-sm">{description}</p>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
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
            <div className="h-100 animate-pulse rounded bg-muted" />
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
      {/* Enhanced Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 font-medium text-sm">
              <Zap className="h-4 w-4 text-primary" />
              {t('total_executions') || 'Total Executions'}
            </CardTitle>
            {trends && (
              <div className="flex items-center gap-1">
                {trends.isExecutionIncreasing ? (
                  <ArrowUp className="h-3 w-3 text-success" />
                ) : (
                  <ArrowDown className="h-3 w-3 text-danger" />
                )}
                <span
                  className={`text-xs ${trends.isExecutionIncreasing ? 'text-success' : 'text-danger'}`}
                >
                  {Math.abs(trends.executionTrend).toFixed(1)}%
                </span>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {totalExecutions.toLocaleString()}
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('total_executions_description') ||
                'Total number of AI executions'}
            </p>
          </CardContent>
          <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-primary/5 to-transparent" />
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 font-medium text-sm">
              <DollarSign className="h-4 w-4 text-success" />
              {t('total_cost') || 'Total Cost'}
            </CardTitle>
            {trends && (
              <div className="flex items-center gap-1">
                {trends.isCostIncreasing ? (
                  <ArrowUp className="h-3 w-3 text-danger" />
                ) : (
                  <ArrowDown className="h-3 w-3 text-success" />
                )}
                <span
                  className={`text-xs ${trends.isCostIncreasing ? 'text-danger' : 'text-success'}`}
                >
                  {Math.abs(trends.costTrend).toFixed(1)}%
                </span>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{formatCost(totalCost)}</div>
            <p className="mt-1 text-muted-foreground text-xs">
              {formatCost(totalCost * 26000, 'VND')}
            </p>
          </CardContent>
          <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-success/5 to-transparent" />
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 font-medium text-sm">
              <TrendingUp className="h-4 w-4 text-warning" />
              {t('total_tokens') || 'Total Tokens'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {totalTokens.toLocaleString()}
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('total_tokens_description') || 'Total tokens processed'}
            </p>
          </CardContent>
          <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-warning/5 to-transparent" />
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 font-medium text-sm">
              <Clock className="h-4 w-4 text-info" />
              {t('avg_per_execution') || 'Avg per Execution'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {formatCost(avgCostPerExecution)}
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              {avgTokensPerExecution.toLocaleString()} {t('tokens') || 'tokens'}
            </p>
          </CardContent>
          <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-info/5 to-transparent" />
        </Card>
      </div>

      {/* Performance Insights */}
      {insights.length > 0 && (
        <Card className="border-warning/20 bg-warning/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <Info className="h-5 w-5" />
              {t('performance_insights') || 'Performance Insights'}
            </CardTitle>
            <CardDescription>
              {t('performance_insights_description') ||
                'Key insights to optimize your AI usage'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {insights.map((insight, index) => (
                <Alert
                  key={index}
                  variant={
                    insight.impact === 'high' ? 'destructive' : 'default'
                  }
                >
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">{insight.title}</div>
                      <div className="text-muted-foreground text-sm">
                        {insight.description}
                      </div>
                    </div>
                    <Badge
                      variant={
                        insight.impact === 'high' ? 'destructive' : 'secondary'
                      }
                      className="ml-2"
                    >
                      {insight.impact === 'high'
                        ? t('high_impact') || 'High Impact'
                        : t('medium_impact') || 'Medium Impact'}
                    </Badge>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enhanced Charts */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            {t('overview') || 'Overview'}
          </TabsTrigger>
          <TabsTrigger value="cost" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            {t('cost_analysis') || 'Cost Analysis'}
          </TabsTrigger>
          <TabsTrigger value="tokens" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            {t('token_analysis') || 'Token Analysis'}
          </TabsTrigger>
          <TabsTrigger value="models" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            {t('model_analysis') || 'Model Analysis'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-success" />
                  {t('cost_trend_overview') || 'Cost & Execution Trend'}
                </CardTitle>
                <CardDescription>
                  {t('cost_trend_overview_description') ||
                    'Daily cost and execution count trends'}
                </CardDescription>
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
                  <div className="h-75">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={costChartData}>
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
                          formatter={(
                            value: number | undefined,
                            name: string | undefined
                          ) => [
                            (name ?? '') === 'cost'
                              ? formatCost(value ?? 0)
                              : (value ?? 0),
                            name ?? '',
                          ]}
                          labelFormatter={(value) =>
                            new Date(value).toLocaleDateString()
                          }
                        />
                        <Legend />
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="cost"
                          stroke={colors.success}
                          fill={colors.success}
                          fillOpacity={0.1}
                          name={t('cost')}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="executions"
                          stroke={colors.primary}
                          strokeWidth={2}
                          name={t('executions')}
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
                  <BarChart3 className="h-5 w-5 text-info" />
                  {t('model_distribution') || 'Model Distribution'}
                </CardTitle>
                <CardDescription>
                  {t('model_distribution_description') ||
                    'Usage distribution across AI models'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {modelData.length === 0 ? (
                  <EmptyState
                    title={t('no_model_data_title') || 'No Model Data'}
                    description={
                      t('no_model_data_description') ||
                      'No model usage data available.'
                    }
                  />
                ) : (
                  <div className="h-75">
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

        <TabsContent value="cost" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-success" />
                {t('detailed_cost_analysis') || 'Detailed Cost Analysis'}
              </CardTitle>
              <CardDescription>
                {t('detailed_cost_analysis_description') ||
                  'Comprehensive cost breakdown and trends'}
              </CardDescription>
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
                <div className="h-100">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={costChartData}>
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
                        tickFormatter={(value) => formatCost(value)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: colors.tooltip.bg,
                          border: `1px solid ${colors.tooltip.border}`,
                          color: colors.tooltip.text,
                        }}
                        formatter={(
                          value: number | undefined,
                          name: string | undefined
                        ) => [
                          formatCost(value ?? 0),
                          (name ?? '') === 'cost'
                            ? t('total_cost')
                            : t('avg_cost_per_execution'),
                        ]}
                        labelFormatter={(value) =>
                          new Date(value).toLocaleDateString()
                        }
                      />
                      <Legend />
                      <Bar
                        yAxisId="left"
                        dataKey="cost"
                        fill={colors.success}
                        name={t('total_cost')}
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="avgCostPerExecution"
                        stroke={colors.warning}
                        strokeWidth={2}
                        name={t('avg_cost_per_execution')}
                        dot={{ fill: colors.warning, strokeWidth: 2, r: 4 }}
                      />
                    </ComposedChart>
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
                {t('detailed_token_analysis') || 'Detailed Token Analysis'}
              </CardTitle>
              <CardDescription>
                {t('detailed_token_analysis_description') ||
                  'Token usage breakdown by type'}
              </CardDescription>
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
                <div className="h-100">
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
                <Zap className="h-5 w-5 text-info" />
                {t('model_performance_analysis') ||
                  'Model Performance Analysis'}
              </CardTitle>
              <CardDescription>
                {t('model_performance_analysis_description') ||
                  'Detailed analysis of model usage and costs'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {modelData.length === 0 ? (
                <EmptyState
                  title={t('no_model_data_title') || 'No Model Data'}
                  description={
                    t('no_model_data_description') ||
                    'No model usage data available for the selected time period.'
                  }
                />
              ) : (
                <div className="h-100">
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
                        formatter={(
                          value: number | undefined,
                          name: string | undefined
                        ) => [
                          (name ?? '') === 'totalCost'
                            ? formatCost(value ?? 0)
                            : (value ?? 0),
                          (name ?? '') === 'totalCost'
                            ? t('total_cost')
                            : t('executions'),
                        ]}
                      />
                      <Legend />
                      <Bar
                        yAxisId="left"
                        dataKey="executions"
                        fill={colors.primary}
                        name={t('executions')}
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        yAxisId="right"
                        dataKey="totalCost"
                        fill={colors.success}
                        name={t('total_cost')}
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
