'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ChevronDown, ChevronRight } from '@tuturuuu/icons';
import type { WorkspaceApiKeyUsageLog } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import moment from 'moment';
import { useState } from 'react';

function ExpandableRowContent({ log }: { log: WorkspaceApiKeyUsageLog }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="h-6 w-6 p-0"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </Button>
      {isExpanded && (
        <div className="mt-2 space-y-2 rounded-md border bg-muted/50 p-3 text-sm">
          {log.ip_address && (
            <div>
              <span className="font-medium">IP Address:</span>{' '}
              <code className="text-xs">
                {log.ip_address === '::1' ? 'localhost' : log.ip_address}
              </code>
            </div>
          )}
          {log.user_agent && (
            <div>
              <span className="font-medium">User Agent:</span>{' '}
              <code className="text-xs">{log.user_agent}</code>
            </div>
          )}
          {log.request_params && Object.keys(log.request_params).length > 0 && (
            <div>
              <span className="font-medium">Request Parameters:</span>
              <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-xs">
                {JSON.stringify(log.request_params, null, 2)}
              </pre>
            </div>
          )}
          {log.error_message && (
            <div>
              <span className="font-medium text-dynamic-red">Error:</span>{' '}
              <span className="text-dynamic-red text-xs">
                {log.error_message}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const usageLogsColumns = ({
  t,
  namespace,
}: ColumnGeneratorOptions<WorkspaceApiKeyUsageLog>): ColumnDef<WorkspaceApiKeyUsageLog>[] => [
  {
    id: 'expand',
    header: '',
    cell: ({ row }) => <ExpandableRowContent log={row.original} />,
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.id`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 max-w-32 break-all font-mono text-xs">
        {row.getValue('id') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t('ws-api-keys.timestamp')}
      />
    ),
    cell: ({ row }) => {
      const timestamp = row.getValue('created_at') as string;
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-sm">
              {moment(timestamp).fromNow()}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{moment(timestamp).format('DD/MM/YYYY, HH:mm:ss')}</p>
          </TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    accessorKey: 'endpoint',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t('ws-api-keys.endpoint')}
      />
    ),
    cell: ({ row }) => {
      const endpoint = row.getValue('endpoint') as string;
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <code className="max-w-64 cursor-help truncate text-xs">
              {endpoint}
            </code>
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-sm break-all">{endpoint}</p>
          </TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    accessorKey: 'method',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t('ws-api-keys.method')}
      />
    ),
    cell: ({ row }) => {
      const method = row.getValue('method') as string;
      const colors: Record<string, string> = {
        GET: 'bg-dynamic-blue/10 text-dynamic-blue',
        POST: 'bg-dynamic-green/10 text-dynamic-green',
        PUT: 'bg-dynamic-orange/10 text-dynamic-orange',
        DELETE: 'bg-dynamic-red/10 text-dynamic-red',
        PATCH: 'bg-dynamic-purple/10 text-dynamic-purple',
      };
      return (
        <Badge variant="outline" className={colors[method] || ''}>
          {method}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'status_code',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t('ws-api-keys.status_code')}
      />
    ),
    cell: ({ row }) => {
      const statusCode = row.getValue('status_code') as number;
      let className = '';

      if (statusCode >= 200 && statusCode < 300) {
        className = 'bg-dynamic-green/10 text-dynamic-green';
      } else if (statusCode >= 300 && statusCode < 400) {
        className = 'bg-dynamic-blue/10 text-dynamic-blue';
      } else if (statusCode >= 400 && statusCode < 500) {
        className = 'bg-dynamic-orange/10 text-dynamic-orange';
      } else if (statusCode >= 500) {
        className = 'bg-dynamic-red/10 text-dynamic-red';
      }

      return (
        <Badge variant="outline" className={className}>
          {statusCode}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'response_time_ms',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t('ws-api-keys.response_time')}
      />
    ),
    cell: ({ row }) => {
      const responseTime = row.getValue('response_time_ms') as number | null;
      if (responseTime === null) {
        return <span className="text-muted-foreground text-sm">-</span>;
      }

      let className = '';
      if (responseTime < 100) {
        className = 'text-dynamic-green';
      } else if (responseTime < 500) {
        className = 'text-dynamic-orange';
      } else {
        className = 'text-dynamic-red';
      }

      return (
        <span className={`font-mono text-sm ${className}`}>
          {responseTime}ms
        </span>
      );
    },
  },
  {
    accessorKey: 'ip_address',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t('ws-api-keys.ip_address')}
      />
    ),
    cell: ({ row }) => {
      const ip = row.getValue('ip_address') as string | null;
      if (!ip) return <span className="text-muted-foreground text-sm">-</span>;
      return <code className="text-xs">{ip === '::1' ? 'localhost' : ip}</code>;
    },
  },
  {
    accessorKey: 'user_agent',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t('ws-api-keys.user_agent')}
      />
    ),
    cell: ({ row }) => {
      const userAgent = row.getValue('user_agent') as string | null;
      if (!userAgent) {
        return <span className="text-muted-foreground text-sm">-</span>;
      }
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <code className="max-w-32 cursor-help truncate text-xs">
              {userAgent}
            </code>
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-md break-all">{userAgent}</p>
          </TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    accessorKey: 'request_params',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t('ws-api-keys.request_params')}
      />
    ),
    cell: ({ row }) => {
      const params = row.getValue('request_params') as Record<
        string,
        unknown
      > | null;
      if (!params || Object.keys(params).length === 0) {
        return <span className="text-muted-foreground text-sm">-</span>;
      }
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-sm">
              {Object.keys(params).length} param(s)
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <pre className="max-w-md overflow-x-auto text-xs">
              {JSON.stringify(params, null, 2)}
            </pre>
          </TooltipContent>
        </Tooltip>
      );
    },
  },
];
