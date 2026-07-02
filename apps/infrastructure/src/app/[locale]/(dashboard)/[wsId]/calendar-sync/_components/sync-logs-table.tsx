'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import type { SyncLog } from '@tuturuuu/ui/legacy/calendar/settings/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useState } from 'react';

interface Props {
  data: SyncLog[];
  compact?: boolean;
}

export default function SyncLogsTable({ data, compact = false }: Props) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No sync logs found
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h3 className="font-semibold text-lg">Sync History</h3>
        <p className="text-muted-foreground text-sm">
          Detailed synchronization logs with performance metrics
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sync Method</TableHead>
              {!compact && <TableHead>Type</TableHead>}
              <TableHead>Duration</TableHead>
              <TableHead>Events</TableHead>
              {!compact && <TableHead>API Calls</TableHead>}
              <TableHead>Triggered By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((log) => {
              const isExpanded = expandedRows.has(log.id);
              const totalEvents =
                log.events.added + log.events.updated + log.events.deleted;

              return (
                <>
                  <TableRow
                    key={log.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleRow(log.id)}
                  >
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatTime(log.timestamp)}
                    </TableCell>
                    <TableCell>
                      {log.status === 'completed' && (
                        <Badge
                          variant="outline"
                          className="gap-1 border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Completed
                        </Badge>
                      )}
                      {log.status === 'failed' && (
                        <Badge
                          variant="outline"
                          className="gap-1 border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400"
                        >
                          <AlertCircle className="h-3 w-3" />
                          Failed
                        </Badge>
                      )}
                      {log.status === 'running' && (
                        <Badge
                          variant="outline"
                          className="gap-1 border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-400"
                        >
                          <Circle className="h-3 w-3 animate-pulse" />
                          Running
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          log.syncContext?.syncTokenUsed
                            ? 'default'
                            : 'secondary'
                        }
                      >
                        {log.syncContext?.syncTokenUsed
                          ? 'Incremental'
                          : 'Full Range'}
                      </Badge>
                    </TableCell>
                    {!compact && (
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {log.type}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-sm">
                      {formatDuration(log.timings?.totalMs || log.duration)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs">
                        {log.events.added > 0 && (
                          <Badge
                            variant="outline"
                            className="border-green-500/50 bg-green-500/10"
                          >
                            +{log.events.added}
                          </Badge>
                        )}
                        {log.events.updated > 0 && (
                          <Badge
                            variant="outline"
                            className="border-blue-500/50 bg-blue-500/10"
                          >
                            ~{log.events.updated}
                          </Badge>
                        )}
                        {log.events.deleted > 0 && (
                          <Badge
                            variant="outline"
                            className="border-red-500/50 bg-red-500/10"
                          >
                            -{log.events.deleted}
                          </Badge>
                        )}
                        {totalEvents === 0 && (
                          <span className="text-muted-foreground">
                            No changes
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {!compact && (
                      <TableCell className="font-mono text-sm">
                        {log.apiMetrics?.callsCount || 0}
                      </TableCell>
                    )}
                    <TableCell className="text-sm">
                      {log.triggeredBy?.display_name || 'System'}
                    </TableCell>
                  </TableRow>

                  {/* Expanded Details Row */}
                  {isExpanded && (
                    <TableRow key={`${log.id}-details`}>
                      <TableCell
                        colSpan={compact ? 7 : 9}
                        className="bg-muted/30"
                      >
                        <div className="grid gap-6 p-4 md:grid-cols-2 lg:grid-cols-3">
                          {/* Performance Timing Breakdown */}
                          <div className="space-y-2">
                            <h4 className="flex items-center gap-2 font-semibold text-sm">
                              <Clock className="h-4 w-4" />
                              Performance Breakdown
                            </h4>
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Google API Fetch:
                                </span>
                                <span className="font-mono">
                                  {formatDuration(
                                    log.timings?.googleApiFetchMs || 0
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Token Operations:
                                </span>
                                <span className="font-mono">
                                  {formatDuration(
                                    log.timings?.tokenOperationsMs || 0
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Event Processing:
                                </span>
                                <span className="font-mono">
                                  {formatDuration(
                                    log.timings?.eventProcessingMs || 0
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Database Writes:
                                </span>
                                <span className="font-mono">
                                  {formatDuration(
                                    log.timings?.databaseWritesMs || 0
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between border-t pt-1 font-semibold">
                                <span>Total:</span>
                                <span className="font-mono">
                                  {formatDuration(
                                    log.timings?.totalMs || log.duration
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* API Metrics */}
                          <div className="space-y-2">
                            <h4 className="font-semibold text-sm">
                              API Metrics
                            </h4>
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  API Calls:
                                </span>
                                <span className="font-mono">
                                  {log.apiMetrics?.callsCount || 0}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Pages Fetched:
                                </span>
                                <span className="font-mono">
                                  {log.apiMetrics?.pagesFetched || 0}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Retry Count:
                                </span>
                                <span className="font-mono">
                                  {log.apiMetrics?.retryCount || 0}
                                </span>
                              </div>
                              {log.apiMetrics?.errorCode && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    Error Code:
                                  </span>
                                  <Badge
                                    variant="destructive"
                                    className="text-xs"
                                  >
                                    {log.apiMetrics.errorCode}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Data Volume */}
                          <div className="space-y-2">
                            <h4 className="font-semibold text-sm">
                              Data Volume
                            </h4>
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Events Fetched:
                                </span>
                                <span className="font-mono">
                                  {log.dataVolume?.eventsFetchedTotal || 0}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Events Filtered:
                                </span>
                                <span className="font-mono">
                                  {log.dataVolume?.eventsFilteredOut || 0}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Batch Operations:
                                </span>
                                <span className="font-mono">
                                  {log.dataVolume?.batchCount || 0}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Calendars Synced:
                                </span>
                                <span className="font-mono">
                                  {log.calendarMetrics?.connectionCount || 1}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Error Details (if failed) */}
                          {log.status === 'failed' &&
                            log.errorDetails?.message && (
                              <div className="space-y-2 md:col-span-2 lg:col-span-3">
                                <h4 className="flex items-center gap-2 font-semibold text-red-600 text-sm dark:text-red-400">
                                  <AlertCircle className="h-4 w-4" />
                                  Error Details
                                </h4>
                                <div className="space-y-2">
                                  {log.errorDetails.type && (
                                    <Badge variant="destructive">
                                      {log.errorDetails.type}
                                    </Badge>
                                  )}
                                  <p className="rounded-md bg-red-500/10 p-3 font-mono text-red-600 text-xs dark:text-red-400">
                                    {log.errorDetails.message}
                                  </p>
                                </div>
                              </div>
                            )}

                          {/* Sync Context */}
                          {log.syncContext && (
                            <div className="space-y-2">
                              <h4 className="font-semibold text-sm">
                                Sync Context
                              </h4>
                              <div className="space-y-1 text-xs">
                                {log.syncContext.triggeredFrom && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                      Source:
                                    </span>
                                    <Badge variant="outline">
                                      {log.syncContext.triggeredFrom.replace(
                                        '_',
                                        ' '
                                      )}
                                    </Badge>
                                  </div>
                                )}
                                {log.syncContext.wasBlockedByCooldown && (
                                  <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                                    <AlertCircle className="h-3 w-3" />
                                    <span>Blocked by cooldown</span>
                                  </div>
                                )}
                                {log.syncContext.dateRangeStart &&
                                  log.syncContext.dateRangeEnd && (
                                    <div className="text-muted-foreground">
                                      Range:{' '}
                                      {formatTime(
                                        log.syncContext.dateRangeStart
                                      )}{' '}
                                      →{' '}
                                      {formatTime(log.syncContext.dateRangeEnd)}
                                    </div>
                                  )}
                              </div>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
