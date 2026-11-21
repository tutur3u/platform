'use client';

import { AlertCircle, ChevronDown, ChevronRight } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import type { SyncLog } from '@tuturuuu/ui/legacy/calendar/settings/types';
import { useState } from 'react';

interface Props {
  data: SyncLog[];
}

export default function ErrorTrackingSection({ data }: Props) {
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());

  const toggleError = (id: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Group errors by type
  const errorsByType = data.reduce(
    (acc, log) => {
      if (log.status === 'failed' && log.errorDetails?.type) {
        const type = log.errorDetails.type;
        if (!acc[type]) {
          acc[type] = [];
        }
        acc[type].push(log);
      }
      return acc;
    },
    {} as Record<string, SyncLog[]>
  );

  const errorTypeStats = Object.entries(errorsByType).map(
    ([type, logs]: [string, SyncLog[]]) => ({
      type,
      count: logs.length,
      percentage: ((logs.length / data.length) * 100).toFixed(1),
    })
  );

  const totalErrors = data.filter((log) => log.status === 'failed').length;

  if (totalErrors === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <div className="rounded-full bg-green-500/10 p-4">
          <AlertCircle className="h-12 w-12 text-green-500" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-lg">No Errors Found</h3>
          <p className="text-muted-foreground text-sm">
            All syncs completed successfully
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Error Overview */}
      <div>
        <h3 className="font-semibold text-lg">Error Overview</h3>
        <p className="text-muted-foreground text-sm">
          {totalErrors} failed {totalErrors === 1 ? 'sync' : 'syncs'} out of{' '}
          {data.length} total
        </p>
      </div>

      {/* Error Type Distribution */}
      {errorTypeStats.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {errorTypeStats.map(({ type, count, percentage }) => (
            <Card key={type}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  {type.charAt(0).toUpperCase() + type.slice(1)} Errors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-3xl">{count}</span>
                  <span className="text-muted-foreground text-sm">
                    ({percentage}%)
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detailed Error List */}
      <div className="space-y-3">
        <h4 className="font-semibold">Error Details</h4>
        {data
          .filter((log) => log.status === 'failed')
          .map((log) => {
            const isExpanded = expandedErrors.has(log.id);

            return (
              <Card key={log.id} className="overflow-hidden">
                <CardHeader
                  className="cursor-pointer pb-3 hover:bg-muted/50"
                  onClick={() => toggleError(log.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">
                          {new Date(log.timestamp).toLocaleString()}
                        </CardTitle>
                        {log.errorDetails?.type && (
                          <Badge variant="destructive">
                            {log.errorDetails.type}
                          </Badge>
                        )}
                      </div>
                      {log.errorDetails?.message && !isExpanded && (
                        <p className="line-clamp-2 text-muted-foreground text-sm">
                          {log.errorDetails.message}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 shrink-0 p-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="space-y-4 border-t pt-4">
                    {/* Error Message */}
                    {log.errorDetails?.message && (
                      <div className="space-y-2">
                        <h5 className="font-medium text-sm">Error Message</h5>
                        <div className="rounded-md bg-red-500/10 p-3 font-mono text-red-600 text-sm dark:text-red-400">
                          {log.errorDetails.message}
                        </div>
                      </div>
                    )}

                    {/* Stack Trace */}
                    {log.errorDetails?.stackTrace && (
                      <div className="space-y-2">
                        <h5 className="font-medium text-sm">Stack Trace</h5>
                        <div className="max-h-48 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
                          <pre className="whitespace-pre-wrap">
                            {log.errorDetails.stackTrace}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Failed Event IDs */}
                    {log.errorDetails?.failedEventIds &&
                      log.errorDetails.failedEventIds.length > 0 && (
                        <div className="space-y-2">
                          <h5 className="font-medium text-sm">
                            Failed Event IDs (
                            {log.errorDetails.failedEventIds.length})
                          </h5>
                          <div className="flex flex-wrap gap-1">
                            {log.errorDetails.failedEventIds
                              .slice(0, 10)
                              .map((eventId: string) => (
                                <Badge
                                  key={eventId}
                                  variant="outline"
                                  className="font-mono text-xs"
                                >
                                  {eventId}
                                </Badge>
                              ))}
                            {log.errorDetails.failedEventIds.length > 10 && (
                              <Badge variant="secondary">
                                +{log.errorDetails.failedEventIds.length - 10}{' '}
                                more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                    {/* Context */}
                    <div className="grid gap-3 text-sm md:grid-cols-2">
                      <div>
                        <span className="text-muted-foreground">
                          Sync Type:
                        </span>
                        <Badge variant="secondary" className="ml-2">
                          {log.type}
                        </Badge>
                      </div>
                      {log.syncContext?.triggeredFrom && (
                        <div>
                          <span className="text-muted-foreground">
                            Triggered From:
                          </span>
                          <Badge variant="outline" className="ml-2">
                            {log.syncContext.triggeredFrom.replace('_', ' ')}
                          </Badge>
                        </div>
                      )}
                      {log.apiMetrics?.errorCode && (
                        <div>
                          <span className="text-muted-foreground">
                            API Error Code:
                          </span>
                          <Badge variant="destructive" className="ml-2">
                            {log.apiMetrics.errorCode}
                          </Badge>
                        </div>
                      )}
                      {log.calendarMetrics?.connectionCount && (
                        <div>
                          <span className="text-muted-foreground">
                            Calendars Affected:
                          </span>
                          <span className="ml-2 font-mono">
                            {log.calendarMetrics.connectionCount}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
      </div>
    </div>
  );
}
