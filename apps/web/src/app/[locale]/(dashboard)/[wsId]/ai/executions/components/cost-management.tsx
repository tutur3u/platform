'use client';

import type {
  AIExecutionModelStats,
  AIExecutionSummary,
} from '../services/analytics-service';
import {
  ALLOWED_MODELS,
  calculateCost,
  formatCost,
} from '../utils/cost-calculator';
import type { WorkspaceAIExecution } from '@tuturuuu/types/db';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import {
  AlertTriangle,
  BarChart3,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface CostManagementProps {
  executions: WorkspaceAIExecution[];
  monthlyBudget?: number; // in USD
  analyticsData?: {
    summary: AIExecutionSummary | null;
    modelStats: AIExecutionModelStats[];
  };
  isLoading?: boolean;
}

export function CostManagement({
  executions,
  monthlyBudget = 100,
  analyticsData,
  isLoading = false,
}: CostManagementProps) {
  const t = useTranslations('ai-execution-charts');

  // Use analytics data if available, otherwise calculate from executions
  const currentMonthCost =
    analyticsData?.summary?.total_cost_usd ||
    executions.reduce((sum, execution) => {
      const cost = calculateCost(execution.model_id, {
        inputTokens: execution.input_tokens,
        outputTokens: execution.output_tokens,
        reasoningTokens: execution.reasoning_tokens,
        totalTokens: execution.total_tokens,
      });
      return sum + cost.totalCostUSD;
    }, 0);

  const budgetUsage = (currentMonthCost / monthlyBudget) * 100;
  const isOverBudget = budgetUsage > 100;
  const isNearBudget = budgetUsage > 80;

  // Use analytics data for model costs if available
  const modelCosts =
    analyticsData?.modelStats ||
    (() => {
      const modelMap = new Map<
        string,
        { cost: number; executions: number; avgCost: number }
      >();

      executions.forEach((execution) => {
        const cost = calculateCost(execution.model_id, {
          inputTokens: execution.input_tokens,
          outputTokens: execution.output_tokens,
          reasoningTokens: execution.reasoning_tokens,
          totalTokens: execution.total_tokens,
        });

        const existing = modelMap.get(execution.model_id) || {
          cost: 0,
          executions: 0,
          avgCost: 0,
        };
        modelMap.set(execution.model_id, {
          cost: existing.cost + cost.totalCostUSD,
          executions: existing.executions + 1,
          avgCost:
            (existing.cost + cost.totalCostUSD) / (existing.executions + 1),
        });
      });

      return Array.from(modelMap.entries()).map(([model, data]) => ({
        model_id: model,
        executions: data.executions,
        total_cost_usd: data.cost,
        total_tokens: 0,
        avg_cost_per_execution: data.avgCost,
        avg_tokens_per_execution: 0,
        percentage_of_total: (data.cost / currentMonthCost) * 100,
      }));
    })();

  // Find most expensive model
  const mostExpensiveModel = modelCosts.reduce(
    (max, model) =>
      model.avg_cost_per_execution > max.avg_cost_per_execution ? model : max,
    {
      model_id: '',
      executions: 0,
      total_cost_usd: 0,
      total_tokens: 0,
      avg_cost_per_execution: 0,
      avg_tokens_per_execution: 0,
      percentage_of_total: 0,
    }
  );

  // Calculate cost optimization suggestions
  const getOptimizationSuggestions = () => {
    const suggestions = [];

    if (mostExpensiveModel.avg_cost_per_execution > 0.01) {
      suggestions.push({
        type: 'model' as const,
        title: t('consider_cheaper_model') || 'Consider using a cheaper model',
        description:
          t('model_optimization_description', {
            model: mostExpensiveModel.model_id,
          }) ||
          `Model ${mostExpensiveModel.model_id} has the highest average cost. Consider switching to a more cost-effective model for similar tasks.`,
        impact: 'high' as const,
      });
    }

    if (executions.length > 100) {
      suggestions.push({
        type: 'volume' as const,
        title: t('batch_requests') || 'Batch your requests',
        description:
          t('batch_optimization_description') ||
          'You have many individual requests. Consider batching similar requests to reduce costs.',
        impact: 'medium' as const,
      });
    }

    if (budgetUsage > 80) {
      suggestions.push({
        type: 'budget' as const,
        title: t('budget_warning') || 'Budget limit approaching',
        description:
          t('budget_optimization_description') ||
          "You're close to your monthly budget. Consider optimizing your AI usage or increasing your budget.",
        impact: 'high' as const,
      });
    }

    return suggestions;
  };

  const suggestions = getOptimizationSuggestions();

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="mb-2 h-6 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-48 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="flex items-center justify-between">
                    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Budget Overview */}
      <Card className="relative overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            {t('budget_overview') || 'Budget Overview'}
          </CardTitle>
          <CardDescription>
            {t('budget_overview_description') ||
              'Monitor your monthly AI spending and budget usage'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {t('monthly_budget') || 'Monthly Budget'}
            </span>
            <span className="text-sm text-muted-foreground">
              {formatCost(monthlyBudget)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {t('current_month_spent') || 'Current Month Spent'}
            </span>
            <span className="text-sm font-medium">
              {formatCost(currentMonthCost)}
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>{t('budget_usage') || 'Budget Usage'}</span>
              <span>{budgetUsage.toFixed(1)}%</span>
            </div>
            <Progress
              value={Math.min(budgetUsage, 100)}
              className={
                isOverBudget
                  ? 'bg-destructive/20'
                  : isNearBudget
                    ? 'bg-warning/20'
                    : ''
              }
            />
          </div>
          {isOverBudget && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {t('budget_exceeded') || 'Monthly budget exceeded'}
              </AlertDescription>
            </Alert>
          )}
          {isNearBudget && !isOverBudget && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {t('budget_warning_message') ||
                  "You're approaching your monthly budget limit"}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent" />
      </Card>

      {/* Model Cost Analysis */}
      <Card className="relative overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="text-info h-5 w-5" />
            {t('model_cost_analysis') || 'Model Cost Analysis'}
          </CardTitle>
          <CardDescription>
            {t('model_cost_analysis_description') ||
              'Breakdown of costs by AI model'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {modelCosts.map((model) => (
              <div
                key={model.model_id}
                className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="space-y-1">
                  <div className="font-medium">{model.model_id}</div>
                  <div className="text-sm text-muted-foreground">
                    {model.executions} {t('executions') || 'executions'} •{' '}
                    {t('avg_cost') || 'Avg Cost'}:{' '}
                    {formatCost(model.avg_cost_per_execution)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">
                    {formatCost(model.total_cost_usd)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {model.percentage_of_total.toFixed(1)}%{' '}
                    {t('of_total') || 'of total'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
        <div className="from-info/5 pointer-events-none absolute inset-0 bg-gradient-to-r to-transparent" />
      </Card>

      {/* Cost Optimization Suggestions */}
      <Card className="relative overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="text-success h-5 w-5" />
            {t('cost_optimization') || 'Cost Optimization'}
          </CardTitle>
          <CardDescription>
            {t('cost_optimization_description') ||
              'Get suggestions to reduce your AI costs'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {suggestions.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                {t('no_optimization_needed') ||
                  'No optimization suggestions at this time'}
              </div>
            ) : (
              suggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex-shrink-0">
                    {suggestion.impact === 'high' ? (
                      <TrendingUp className="h-5 w-5 text-destructive" />
                    ) : (
                      <TrendingDown className="text-warning h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{suggestion.title}</span>
                      <Badge
                        variant={
                          suggestion.impact === 'high'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {suggestion.impact === 'high'
                          ? t('high_impact') || 'High Impact'
                          : t('medium_impact') || 'Medium Impact'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {suggestion.description}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
        <div className="from-success/5 pointer-events-none absolute inset-0 bg-gradient-to-r to-transparent" />
      </Card>

      {/* Pricing Information */}
      <Card className="relative overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="text-warning h-5 w-5" />
            {t('pricing_information') || 'Pricing Information'}
          </CardTitle>
          <CardDescription>
            {t('pricing_information_description') ||
              'Current pricing for all available AI models'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {ALLOWED_MODELS.map((model) => (
              <div
                key={model.name}
                className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div>
                  <div className="font-medium">{model.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {t('input') || 'Input'}: ${model.price.per1MInputTokens} •{' '}
                    {t('output') || 'Output'}: ${model.price.per1MOutputTokens}
                  </div>
                </div>
                <Badge variant="outline">{t('active') || 'Active'}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
        <div className="from-warning/5 pointer-events-none absolute inset-0 bg-gradient-to-r to-transparent" />
      </Card>
    </div>
  );
}
