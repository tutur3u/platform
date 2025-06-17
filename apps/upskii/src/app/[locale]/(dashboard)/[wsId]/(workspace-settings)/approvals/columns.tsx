'use client';

import { WorkspaceApprovalRequest } from './page';
import { ApprovalRowActions } from './row-actions';
import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@tuturuuu/ui/badge';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { cn } from '@tuturuuu/utils/format';
import moment from 'moment';

export const approvalsColumns = (
  t: any,
  namespace: string | undefined
): ColumnDef<WorkspaceApprovalRequest>[] => [
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
      <div className="line-clamp-1 max-w-32 break-all">
        {row.getValue('id')}
      </div>
    ),
  },
  {
    accessorKey: 'workspace_name',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Workspace" />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 max-w-48 font-semibold break-words">
        {row.getValue('workspace_name')}
      </div>
    ),
  },
  {
    accessorKey: 'creator_name',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Creator" />
    ),
    cell: ({ row }) => {
      const creatorName = row.getValue('creator_name') as string;

      return (
        <div className="flex max-w-48 flex-col gap-1">
          <div className="line-clamp-1 font-medium break-words">
            {creatorName}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'feature_requested',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Feature Requested" />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 max-w-32 break-words">
        {row.getValue('feature_requested')}
      </div>
    ),
  },
  {
    accessorKey: 'request_message',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Message" />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-2 max-w-64 text-sm break-words text-muted-foreground">
        {row.getValue('request_message')}
      </div>
    ),
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = row.getValue('status') as string;

      return (
        <Badge
          variant={
            status === 'approved'
              ? 'default'
              : status === 'rejected'
                ? 'destructive'
                : 'secondary'
          }
          className={cn(
            'capitalize',
            status === 'approved' &&
              'border-green-200 bg-green-100 text-green-800',
            status === 'rejected' && 'border-red-200 bg-red-100 text-red-800',
            status === 'pending' &&
              'border-yellow-200 bg-yellow-100 text-yellow-800'
          )}
        >
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Requested At" />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-2 max-w-32 text-sm break-all">
        {row.getValue('created_at')
          ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm')
          : '-'}
      </div>
    ),
  },
  {
    id: 'actions',
    header: ({ column }) => <DataTableColumnHeader t={t} column={column} />,
    cell: ({ row }) => <ApprovalRowActions row={row} />,
  },
];
