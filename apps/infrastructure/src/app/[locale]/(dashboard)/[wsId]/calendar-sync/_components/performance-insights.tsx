'use client';

import {
  AlertCircle,
  CheckCircle2,
  Info,
  TrendingDown,
  TrendingUp,
  Zap,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import type { SyncLog } from '@tuturuuu/ui/legacy/calendar/settings/types';
import { useMemo } from 'react';

interface Props {
  data: SyncLog[];
}

interface Insight {
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  description: string;
  metric?: string;
  recommendation?: string;
}

export default function PerformanceInsights({ data }: Props) {
  const insights = useMemo(() => {
    const results: Insight[] = [];

    if (data.length === 0) return results;

    // Calculate metrics
    const completedSyncs = data.filter((log) => log.status === 'completed');
    const avgDuration =
      completedSyncs.reduce(
        (sum, log) => sum + (log.timings?.totalMs || log.duration),
        0
      ) / (completedSyncs.length || 1);

    const totalDeletes = data.reduce((sum, log) => sum + log.events.deleted, 0);
    const totalAdds = data.reduce((sum, log) => sum + log.events.added, 0);

    // Calculate delete/add ratio to detect inefficient sync patterns
    const deleteAddRatio = totalAdds > 0 ? totalDeletes / totalAdds : 0;

    // Check API efficiency
    const avgApiCalls =
      data.reduce((sum, log) => sum + (log.apiMetrics?.callsCount || 0), 0) /
      (data.length || 1);

    const avgPagesFetched =
      data.reduce((sum, log) => sum + (log.apiMetrics?.pagesFetched || 0), 0) /
      (data.length || 1);

    // Sync token usage
    const syncTokenUsageRate =
      data.filter((log) => log.syncContext?.syncTokenUsed).length /
      (data.length || 1);

    // Performance timing analysis
    const avgTimings = {
      googleApi:
        completedSyncs.reduce(
          (sum, log) => sum + (log.timings?.googleApiFetchMs || 0),
          0
        ) / (completedSyncs.length || 1),
      processing:
        completedSyncs.reduce(
          (sum, log) => sum + (log.timings?.eventProcessingMs || 0),
          0
        ) / (completedSyncs.length || 1),
      database:
        completedSyncs.reduce(
          (sum, log) => sum + (log.timings?.databaseWritesMs || 0),
          0
        ) / (completedSyncs.length || 1),
    };

    // Insight 1: Success Rate
    const successRate = (completedSyncs.length / data.length) * 100;
    if (successRate === 100) {
      results.push({
        type: 'success',
        title: 'Perfect Success Rate',
        description: 'All syncs completed successfully',
        metric: '100%',
      });
    } else if (successRate >= 95) {
      results.push({
        type: 'success',
        title: 'High Success Rate',
        description: 'Most syncs are completing successfully',
        metric: `${successRate.toFixed(1)}%`,
      });
    } else if (successRate >= 80) {
      results.push({
        type: 'warning',
        title: 'Moderate Success Rate',
        description: 'Some syncs are failing',
        metric: `${successRate.toFixed(1)}%`,
        recommendation: 'Review error logs to identify common failure patterns',
      });
    } else {
      results.push({
        type: 'error',
        title: 'Low Success Rate',
        description: 'Many syncs are failing',
        metric: `${successRate.toFixed(1)}%`,
        recommendation:
          'Urgent: Review authentication and API connectivity issues',
      });
    }

    // Insight 2: Delete/Add Ratio (inefficient sync detection)
    if (deleteAddRatio > 0.8 && totalDeletes > 10) {
      results.push({
        type: 'warning',
        title: 'Inefficient Sync Pattern Detected',
        description: `High delete-to-add ratio (${deleteAddRatio.toFixed(2)}:1) suggests events are being deleted and re-added`,
        metric: `${totalDeletes} deletes, ${totalAdds} adds`,
        recommendation:
          'Consider optimizing the sync logic to update events instead of deleting and re-creating them',
      });
    } else if (deleteAddRatio > 0.5 && totalDeletes > 20) {
      results.push({
        type: 'info',
        title: 'Moderate Event Churn',
        description: 'Balanced mix of deletes and adds',
        metric: `${totalDeletes} deletes, ${totalAdds} adds`,
      });
    }

    // Insight 3: Performance Analysis
    if (avgDuration < 500) {
      results.push({
        type: 'success',
        title: 'Excellent Performance',
        description: 'Sync operations are completing very quickly',
        metric: `${avgDuration.toFixed(0)}ms average`,
      });
    } else if (avgDuration < 1000) {
      results.push({
        type: 'success',
        title: 'Good Performance',
        description: 'Sync operations are completing in reasonable time',
        metric: `${avgDuration.toFixed(0)}ms average`,
      });
    } else if (avgDuration < 2000) {
      results.push({
        type: 'warning',
        title: 'Moderate Performance',
        description: 'Sync operations could be faster',
        metric: `${avgDuration.toFixed(0)}ms average`,
        recommendation:
          'Review API call efficiency and batch processing optimization',
      });
    } else {
      results.push({
        type: 'error',
        title: 'Slow Performance',
        description: 'Sync operations are taking too long',
        metric: `${avgDuration.toFixed(0)}ms average`,
        recommendation:
          'Investigate network latency, API response times, and database write performance',
      });
    }

    // Insight 4: Sync Token Usage
    if (syncTokenUsageRate > 0.8) {
      results.push({
        type: 'success',
        title: 'Efficient Incremental Syncs',
        description: 'Most syncs are using sync tokens',
        metric: `${(syncTokenUsageRate * 100).toFixed(0)}% incremental`,
        recommendation:
          'Excellent! Incremental syncs reduce API calls and improve performance',
      });
    } else if (syncTokenUsageRate > 0.5) {
      results.push({
        type: 'info',
        title: 'Mixed Sync Methods',
        description: 'Some syncs are using full date range fetches',
        metric: `${(syncTokenUsageRate * 100).toFixed(0)}% incremental`,
        recommendation:
          'Monitor for sync token expiration (410 errors) that cause fallback to full range',
      });
    } else {
      results.push({
        type: 'warning',
        title: 'Low Incremental Sync Usage',
        description: 'Most syncs are fetching full date ranges',
        metric: `${(syncTokenUsageRate * 100).toFixed(0)}% incremental`,
        recommendation:
          'Investigate why sync tokens are not being used - this increases API load',
      });
    }

    // Insight 5: Bottleneck Analysis
    const slowestPhase = Object.entries(avgTimings).reduce(
      (max, [key, val]) => (val > max.value ? { phase: key, value: val } : max),
      { phase: '', value: 0 }
    );

    if (slowestPhase.value > avgDuration * 0.4) {
      const phaseNames = {
        googleApi: 'Google API Fetch',
        processing: 'Event Processing',
        database: 'Database Writes',
      };

      results.push({
        type: 'info',
        title: 'Performance Bottleneck Identified',
        description: `${phaseNames[slowestPhase.phase as keyof typeof phaseNames]} accounts for ${((slowestPhase.value / avgDuration) * 100).toFixed(0)}% of sync time`,
        metric: `${slowestPhase.value.toFixed(0)}ms average`,
        recommendation:
          slowestPhase.phase === 'googleApi'
            ? 'Consider reducing date range or optimizing API pagination'
            : slowestPhase.phase === 'processing'
              ? 'Optimize event filtering and formatting logic'
              : 'Review database batch sizes and indexes',
      });
    }

    // Insight 6: API Efficiency
    if (avgApiCalls > 5 && avgPagesFetched / avgApiCalls < 0.8) {
      results.push({
        type: 'warning',
        title: 'Multiple API Calls Per Sync',
        description: 'Sync operations are making multiple API requests',
        metric: `${avgApiCalls.toFixed(1)} calls/sync`,
        recommendation:
          'Ensure sync tokens are being stored correctly to enable incremental syncs',
      });
    }

    // Insight 7: Retry Rate
    const totalRetries = data.reduce(
      (sum, log) => sum + (log.apiMetrics?.retryCount || 0),
      0
    );
    const retryRate = totalRetries / (data.length || 1);

    if (retryRate > 1) {
      results.push({
        type: 'warning',
        title: 'High Retry Rate',
        description: 'Frequent API failures requiring retries',
        metric: `${retryRate.toFixed(1)} retries/sync`,
        recommendation:
          'Check for network issues or API rate limiting problems',
      });
    }

    return results;
  }, [data]);

  if (insights.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground">
        Not enough data for performance analysis
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h3 className="font-semibold text-lg">Performance Insights</h3>
        <p className="text-muted-foreground text-sm">
          Automated analysis and recommendations based on sync patterns
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {insights.map((insight, index) => (
          <Card
            key={index}
            className={`overflow-hidden border-l-4 ${
              insight.type === 'success'
                ? 'border-l-green-500'
                : insight.type === 'warning'
                  ? 'border-l-yellow-500'
                  : insight.type === 'error'
                    ? 'border-l-red-500'
                    : 'border-l-blue-500'
            }`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  {insight.type === 'success' && (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  )}
                  {insight.type === 'warning' && (
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                  )}
                  {insight.type === 'error' && (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  )}
                  {insight.type === 'info' && (
                    <Info className="h-5 w-5 text-blue-500" />
                  )}
                  <span>{insight.title}</span>
                </CardTitle>
                {insight.metric && (
                  <Badge
                    variant={
                      insight.type === 'success'
                        ? 'default'
                        : insight.type === 'error'
                          ? 'destructive'
                          : 'secondary'
                    }
                    className="shrink-0 font-mono"
                  >
                    {insight.metric}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-muted-foreground text-sm">
                {insight.description}
              </p>
              {insight.recommendation && (
                <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm">
                  {insight.type === 'success' ? (
                    <Zap className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                  ) : insight.type === 'warning' || insight.type === 'error' ? (
                    <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                  ) : (
                    <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                  )}
                  <span>{insight.recommendation}</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
