'use client';

import {
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  TrendingUp,
} from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';

interface InsightsPanelProps {
  summary: {
    totalRequests: number;
    totalErrors: number;
    errorRate: number;
    avgRequestsPerHour: number;
    peakHourCount: number;
  };
  topWorkspaces: Array<{
    id: string;
    name: string;
    requests: number;
    errorRate: number;
  }>;
  topChannels: Array<{ id: string; name: string; requests: number }>;
  isLoading?: boolean;
}

interface Insight {
  type: 'warning' | 'info' | 'success' | 'danger';
  title: string;
  message: string;
  action?: string;
}

export function InsightsPanel({
  summary,
  topWorkspaces,
  topChannels,
  isLoading,
}: InsightsPanelProps) {
  const t = useTranslations('realtime-analytics.insights');

  const generateInsights = (): Insight[] => {
    const insights: Insight[] = [];

    // Error rate insights
    if (summary.errorRate > 5) {
      insights.push({
        type: 'danger',
        title: t('high_error_rate.title'),
        message: t('high_error_rate.message', {
          rate: summary.errorRate.toFixed(2),
        }),
        action: t('high_error_rate.action'),
      });
    } else if (summary.errorRate > 1) {
      insights.push({
        type: 'warning',
        title: t('elevated_error_rate.title'),
        message: t('elevated_error_rate.message', {
          rate: summary.errorRate.toFixed(2),
        }),
        action: t('elevated_error_rate.action'),
      });
    } else if (summary.totalRequests > 0) {
      insights.push({
        type: 'success',
        title: t('low_error_rate.title'),
        message: t('low_error_rate.message', {
          rate: summary.errorRate.toFixed(2),
        }),
      });
    }

    // High usage insights
    if (summary.avgRequestsPerHour > 1000) {
      insights.push({
        type: 'warning',
        title: t('high_usage.title'),
        message: t('high_usage.message', {
          avg: Math.round(summary.avgRequestsPerHour).toLocaleString(),
        }),
        action: t('high_usage.action'),
      });
    }

    // Peak hour insights
    const avgToPeakRatio = summary.peakHourCount / summary.avgRequestsPerHour;
    if (avgToPeakRatio > 3 && summary.peakHourCount > 100) {
      insights.push({
        type: 'info',
        title: t('traffic_spike.title'),
        message: t('traffic_spike.message', {
          ratio: avgToPeakRatio.toFixed(1),
        }),
        action: t('traffic_spike.action'),
      });
    }

    // Top workspace concentration
    if (topWorkspaces.length > 0) {
      const topWorkspacePercentage =
        (topWorkspaces[0]!.requests / summary.totalRequests) * 100;
      if (topWorkspacePercentage > 50) {
        insights.push({
          type: 'info',
          title: t('workspace_concentration.title'),
          message: t('workspace_concentration.message', {
            name: topWorkspaces[0]!.name,
            percentage: topWorkspacePercentage.toFixed(1),
          }),
          action: t('workspace_concentration.action'),
        });
      }
    }

    // Workspace with high error rate
    const problematicWorkspace = topWorkspaces.find((ws) => ws.errorRate > 10);
    if (problematicWorkspace) {
      insights.push({
        type: 'warning',
        title: t('workspace_errors.title'),
        message: t('workspace_errors.message', {
          name: problematicWorkspace.name,
          rate: problematicWorkspace.errorRate.toFixed(2),
        }),
        action: t('workspace_errors.action'),
      });
    }

    // Many active channels
    if (topChannels.length >= 10) {
      insights.push({
        type: 'info',
        title: t('many_channels.title'),
        message: t('many_channels.message', {
          count: topChannels.length,
        }),
        action: t('many_channels.action'),
      });
    }

    return insights;
  };

  const insights = generateInsights();

  const iconMap = {
    warning: <AlertTriangle className="h-5 w-5 text-dynamic-yellow" />,
    danger: <AlertTriangle className="h-5 w-5 text-dynamic-red" />,
    info: <Lightbulb className="h-5 w-5 text-dynamic-blue" />,
    success: <CheckCircle className="h-5 w-5 text-dynamic-green" />,
  };

  const borderMap = {
    warning: 'border-dynamic-yellow/30 bg-dynamic-yellow/5',
    danger: 'border-dynamic-red/30 bg-dynamic-red/5',
    info: 'border-dynamic-blue/30 bg-dynamic-blue/5',
    success: 'border-dynamic-green/30 bg-dynamic-green/5',
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b p-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-lg">{t('title')}</h3>
        </div>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </div>
      <div className="p-4">
        {insights.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">{t('no_insights')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((insight, index) => (
              <div
                key={index}
                className={`rounded-lg border p-4 ${borderMap[insight.type]}`}
              >
                <div className="flex gap-3">
                  <div className="shrink-0">{iconMap[insight.type]}</div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">{insight.title}</h4>
                    <p className="mt-1 text-muted-foreground text-sm">
                      {insight.message}
                    </p>
                    {insight.action && (
                      <p className="mt-2 font-medium text-sm">
                        💡 {insight.action}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
