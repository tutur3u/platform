'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, Clock, RefreshCw, RefreshCwOff, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { TimezoneRowActions } from './row-actions';
import {
  formatTimezoneDate,
  formatTimezoneMetadata,
  formatTimezoneOffset,
} from './timezone-utils';
import type {
  TimezoneManagementLabels,
  TimezoneManagementRow,
  TimezoneMutationPayload,
} from './types';

type TimezoneColumnsExtraData = {
  isMutating?: boolean;
  labels: TimezoneManagementLabels;
  onDelete: (row: TimezoneManagementRow) => Promise<void> | void;
  onSync: (row: TimezoneManagementRow) => Promise<void> | void;
  onUpdate: (
    row: TimezoneManagementRow,
    payload: TimezoneMutationPayload
  ) => Promise<void> | void;
};

function getExtraData(extraData: unknown): TimezoneColumnsExtraData {
  return extraData as TimezoneColumnsExtraData;
}

function TimezoneStatusBadge({
  labels,
  status,
}: {
  labels: TimezoneManagementLabels;
  status: TimezoneManagementRow['status'];
}) {
  const normalizedStatus = status ?? 'outdated';
  const statusConfig = {
    error: {
      className: 'border-destructive/30 bg-destructive/10 text-destructive',
      icon: X,
    },
    outdated: {
      className: 'border-border bg-muted text-muted-foreground',
      icon: RefreshCwOff,
    },
    pending: {
      className: 'border-primary/30 bg-primary/10 text-primary',
      icon: RefreshCw,
    },
    synced: {
      className: 'border-border bg-background text-foreground',
      icon: Check,
    },
  } satisfies Record<
    NonNullable<TimezoneManagementRow['status']>,
    {
      className: string;
      icon: typeof Check;
    }
  >;
  const config = statusConfig[normalizedStatus];
  const Icon = config.icon;

  return (
    <Badge className={config.className} variant="outline">
      <Icon className="h-3.5 w-3.5" />
      {labels.status[normalizedStatus]}
    </Badge>
  );
}

export const getTimezoneColumns = ({
  extraData,
  t,
}: ColumnGeneratorOptions<TimezoneManagementRow>): ColumnDef<TimezoneManagementRow>[] => {
  const { isMutating, labels, onDelete, onSync, onUpdate } =
    getExtraData(extraData);

  return [
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={labels.columns.id}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1 max-w-36 font-mono text-xs">
          {row.original.id || '-'}
        </div>
      ),
    },
    {
      accessorKey: 'value',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={labels.columns.value}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-2 max-w-64 font-medium">
          {row.original.value}
        </div>
      ),
    },
    {
      accessorKey: 'hours',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={labels.columns.hours}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-2 max-w-40">
          {formatTimezoneMetadata(row.original.hours)}
        </div>
      ),
    },
    {
      accessorKey: 'priority',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={labels.columns.priority}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1 max-w-32">
          {formatTimezoneMetadata(row.original.priority)}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={labels.columns.status}
        />
      ),
      cell: ({ row }) => (
        <TimezoneStatusBadge labels={labels} status={row.original.status} />
      ),
    },
    {
      accessorKey: 'offset',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={labels.columns.offset}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1 font-mono text-sm">
          {formatTimezoneOffset(row.original.offset)}
        </div>
      ),
    },
    {
      accessorKey: 'abbr',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={labels.columns.abbr}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1 max-w-20">{row.original.abbr || '-'}</div>
      ),
    },
    {
      accessorKey: 'isdst',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={labels.columns.isdst}
        />
      ),
      cell: ({ row }) => (
        <div className="flex items-center">
          {row.original.isdst ? (
            <Check className="h-4 w-4 text-primary" />
          ) : (
            <X className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      ),
    },
    {
      accessorKey: 'text',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={labels.columns.text}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-2 max-w-72">{row.original.text || '-'}</div>
      ),
    },
    {
      accessorKey: 'utc',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={labels.columns.utc}
        />
      ),
      cell: ({ row }) => (
        <div className="flex max-w-36 items-center gap-1 text-sm">
          <span>{row.original.utc.length || '-'}</span>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </div>
      ),
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={labels.columns.createdAt}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-2 max-w-36 text-sm">
          {formatTimezoneDate(row.original.created_at)}
        </div>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <TimezoneRowActions
          isMutating={isMutating}
          labels={labels}
          onDelete={onDelete}
          onSync={onSync}
          onUpdate={onUpdate}
          row={row.original}
        />
      ),
    },
  ];
};
