'use client';

import { Badge } from '@tuturuuu/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { cn } from '@tuturuuu/utils/format';
import {
  type MonitoringRequestsTranslations,
  StatusBadge,
} from './archive-primitives';
import {
  formatClockTime,
  formatDateTime,
  formatLatencyMs,
  formatRelativeTime,
} from './formatters';
import type { EnrichedMonitoringRequest } from './request-utils';
import { getRequestKey } from './request-utils';

export function MonitoringRequestsTable({
  inspectedRequestKey,
  onInspect,
  requests,
  t,
}: {
  inspectedRequestKey: string | null;
  onInspect: (request: EnrichedMonitoringRequest) => void;
  requests: EnrichedMonitoringRequest[];
  t: MonitoringRequestsTranslations;
}) {
  return (
    <Table className="[&_td]:align-top">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{t('explorer.table_route')}</TableHead>
          <TableHead>{t('explorer.table_status')}</TableHead>
          <TableHead>{t('explorer.table_render')}</TableHead>
          <TableHead>{t('explorer.table_deployment')}</TableHead>
          <TableHead>{t('explorer.table_latency')}</TableHead>
          <TableHead>{t('explorer.table_time')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((request) => {
          const requestKey = getRequestKey(request);
          const hasError =
            request.statusFamily === '4xx' || request.statusFamily === '5xx';

          return (
            <TableRow
              className={cn(
                'cursor-pointer',
                inspectedRequestKey === requestKey && 'bg-dynamic-blue/5'
              )}
              key={requestKey}
              onClick={() => onInspect(request)}
            >
              <TableCell className="min-w-[300px]">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className="rounded-full"
                      variant={hasError ? 'destructive' : 'outline'}
                    >
                      {request.method ?? 'REQ'}
                    </Badge>
                    <span className="font-medium text-sm">
                      {request.parsedPath.pathname}
                    </span>
                    {request.isInternal ? (
                      <Badge className="rounded-full" variant="secondary">
                        {t('requests.internal')}
                      </Badge>
                    ) : null}
                    {request.parsedPath.isServerComponentRequest ? (
                      <Badge className="rounded-full" variant="outline">
                        {t('explorer.render_rsc')}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="break-all text-muted-foreground text-xs">
                    {request.path}
                  </div>
                  <div className="flex flex-wrap gap-2 text-muted-foreground text-xs">
                    <span>{request.host ?? t('states.none')}</span>
                    <span>{formatDateTime(request.time)}</span>
                    <span>
                      {request.parsedPath.querySignature ||
                        t('explorer.no_query_signature')}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge
                  tone={
                    request.statusFamily === '5xx'
                      ? 'destructive'
                      : request.statusFamily === '4xx'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {request.status ?? '-'}
                </StatusBadge>
              </TableCell>
              <TableCell>
                <div className="space-y-1 text-sm">
                  <div className="font-medium">
                    {request.parsedPath.isServerComponentRequest
                      ? t('explorer.render_rsc')
                      : t('explorer.render_document')}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {request.isInternal
                      ? t('explorer.traffic_internal')
                      : t('explorer.traffic_external')}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-1 text-sm">
                  <div className="font-medium">
                    {request.deploymentStamp ??
                      request.deploymentColor ??
                      t('states.none')}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {request.deploymentKey ?? t('states.none')}
                  </div>
                </div>
              </TableCell>
              <TableCell className="font-medium">
                {formatLatencyMs(request.requestTimeMs)}
              </TableCell>
              <TableCell>
                <div className="space-y-1 text-sm">
                  <div className="font-medium">
                    {formatClockTime(request.time)}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {formatRelativeTime(request.time)}
                  </div>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
