'use client';

import { AlertCircle, TrendingDown, TrendingUp } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';

interface MetricComparisonProps {
  topWorkspaces: Array<{
    id: string;
    name: string;
    requests: number;
    errorRate: number;
  }>;
  topUsers: Array<{ id: string; name: string; requests: number }>;
  totalRequests: number;
  isLoading?: boolean;
}

export function MetricComparisons({
  topWorkspaces,
  topUsers,
  totalRequests,
  isLoading,
}: MetricComparisonProps) {
  const t = useTranslations('realtime-analytics.comparisons');

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-lg border bg-card"
          />
        ))}
      </div>
    );
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toLocaleString();
  };

  // Calculate top workspace concentration
  const topWorkspacePercentage =
    topWorkspaces.length > 0 && totalRequests > 0
      ? (topWorkspaces[0]!.requests / totalRequests) * 100
      : 0;

  // Calculate top 3 workspaces concentration
  const top3WorkspacesRequests = topWorkspaces
    .slice(0, 3)
    .reduce((sum, ws) => sum + ws.requests, 0);
  const top3Percentage =
    totalRequests > 0 ? (top3WorkspacesRequests / totalRequests) * 100 : 0;

  // Calculate top user concentration
  const topUserPercentage =
    topUsers.length > 0 && totalRequests > 0
      ? (topUsers[0]!.requests / totalRequests) * 100
      : 0;

  // Determine if distribution is healthy (not too concentrated)
  const isHealthyDistribution =
    topWorkspacePercentage < 50 && top3Percentage < 80;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 font-semibold text-lg">{t('title')}</h3>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Top Workspace Concentration */}
        <div
          className={`rounded-lg border p-4 ${
            topWorkspacePercentage > 50
              ? 'border-dynamic-yellow/30 bg-dynamic-yellow/5'
              : 'bg-card'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-muted-foreground text-sm">
                {t('top_workspace')}
              </p>
              <p className="mt-2 font-bold text-2xl">
                {topWorkspacePercentage.toFixed(1)}%
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                {topWorkspaces[0]?.name || 'N/A'}
              </p>
            </div>
            {topWorkspacePercentage > 50 ? (
              <AlertCircle className="h-5 w-5 text-dynamic-yellow" />
            ) : (
              <TrendingDown className="h-5 w-5 text-dynamic-green" />
            )}
          </div>
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${
                  topWorkspacePercentage > 50
                    ? 'bg-dynamic-yellow'
                    : 'bg-dynamic-green'
                }`}
                style={{ width: `${Math.min(topWorkspacePercentage, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Top 3 Workspaces Concentration */}
        <div
          className={`rounded-lg border p-4 ${
            top3Percentage > 80
              ? 'border-dynamic-yellow/30 bg-dynamic-yellow/5'
              : 'bg-card'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-muted-foreground text-sm">
                {t('top_3_workspaces')}
              </p>
              <p className="mt-2 font-bold text-2xl">
                {top3Percentage.toFixed(1)}%
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                {formatNumber(top3WorkspacesRequests)} {t('requests')}
              </p>
            </div>
            {top3Percentage > 80 ? (
              <AlertCircle className="h-5 w-5 text-dynamic-yellow" />
            ) : (
              <TrendingDown className="h-5 w-5 text-dynamic-green" />
            )}
          </div>
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${
                  top3Percentage > 80 ? 'bg-dynamic-yellow' : 'bg-dynamic-green'
                }`}
                style={{ width: `${Math.min(top3Percentage, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Top User Concentration */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-muted-foreground text-sm">{t('top_user')}</p>
              <p className="mt-2 font-bold text-2xl">
                {topUserPercentage.toFixed(1)}%
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                {topUsers[0]?.name || 'N/A'}
              </p>
            </div>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-dynamic-blue transition-all"
                style={{ width: `${Math.min(topUserPercentage, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Distribution Health Indicator */}
      <div
        className={`rounded-lg border p-4 ${
          isHealthyDistribution
            ? 'border-dynamic-green/30 bg-dynamic-green/5'
            : 'border-dynamic-yellow/30 bg-dynamic-yellow/5'
        }`}
      >
        <div className="flex items-start gap-3">
          {isHealthyDistribution ? (
            <TrendingDown className="h-5 w-5 shrink-0 text-dynamic-green" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 text-dynamic-yellow" />
          )}
          <div>
            <p className="font-semibold text-sm">
              {isHealthyDistribution
                ? t('healthy_distribution')
                : t('concentrated_distribution')}
            </p>
            <p className="mt-1 text-muted-foreground text-sm">
              {isHealthyDistribution
                ? t('healthy_distribution_desc')
                : t('concentrated_distribution_desc')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
