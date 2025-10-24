'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { EnhancedTaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import Link from 'next/link';
import { ProjectRowActions } from './row-actions';

export const projectColumns = (
  t: (key: string) => string,
  namespace: string | undefined
): ColumnDef<EnhancedTaskBoard>[] => [
  // {
  //   id: 'select',
  //   header: ({ table }) => (
  //     <Checkbox
  //       checked={table.getIsAllPageRowsSelected()}
  //       onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
  //       aria-label="Select all"
  //       className="translate-y-[2px]"
  //     />
  //   ),
  //   cell: ({ row }) => (
  //     <Checkbox
  //       checked={row.getIsSelected()}
  //       onCheckedChange={(value) => row.toggleSelected(!!value)}
  //       aria-label="Select row"
  //       className="translate-y-[2px]"
  //     />
  //   ),
  //   enableSorting: false,
  //   enableHiding: false,
  // },
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
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.name`)}
      />
    ),
    cell: ({ row }) => (
      <div className="space-y-1">
        <Link
          href={`/${row.original.ws_id}/tasks/boards/${row.getValue('id')}`}
          className="line-clamp-1 max-w-32 break-all font-semibold hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.getValue('name') || '-'}
        </Link>
      </div>
    ),
  },
  {
    accessorKey: 'totalTasks',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Total Tasks" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div className="rounded border border-dynamic-blue/20 bg-dynamic-blue/10 px-2 py-1">
          <span className="font-medium text-dynamic-blue">
            {row.original.totalTasks || 0}
          </span>
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'completedTasks',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Completed" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div className="rounded border border-dynamic-green/20 bg-dynamic-green/10 px-2 py-1">
          <span className="font-medium text-dynamic-green">
            {row.original.completedTasks || 0}
          </span>
        </div>
        {row.original.totalTasks > 0 && (
          <span className="text-muted-foreground text-xs">
            (
            {Math.round(
              ((row.original.completedTasks || 0) / row.original.totalTasks) *
                100
            )}
            %)
          </span>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'activeTasks',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Active" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div className="rounded border border-dynamic-orange/20 bg-dynamic-orange/10 px-2 py-1">
          <span className="font-medium text-dynamic-orange text-sm">
            {row.original.activeTasks || 0}
          </span>
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'overdueTasks',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Overdue" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div
          className={`rounded border px-2 py-1 ${
            (row.original.overdueTasks || 0) > 0
              ? 'border-dynamic-red/20 bg-dynamic-red/10'
              : 'border-dynamic-gray/20 bg-dynamic-gray/10'
          }`}
        >
          <span
            className={`border font-medium text-sm ${
              (row.original.overdueTasks || 0) > 0
                ? 'text-dynamic-red'
                : 'text-dynamic-gray'
            }`}
          >
            {row.original.overdueTasks || 0}
          </span>
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'progressPercentage',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Progress" />
    ),
    cell: ({ row }) => (
      <div className="flex w-24 items-center gap-2">
        <div className="h-2 flex-1 rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500"
            style={{ width: `${row.original.progressPercentage || 0}%` }}
          />
        </div>
        <span className="font-medium text-sm">
          {row.original.progressPercentage || 0}%
        </span>
      </div>
    ),
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.created_at`)}
      />
    ),
    cell: ({ row }) => (
      <div>
        {row.getValue('created_at')
          ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')
          : '-'}
      </div>
    ),
  },
  {
    id: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const board = row.original;
      
      // Calculate days remaining for soft-deleted boards
      const calculateDaysRemaining = (deletedAt: string | null) => {
        if (!deletedAt) return null;
        const deletedDate = new Date(deletedAt);
        const now = new Date();
        const daysPassed = Math.floor(
          (now.getTime() - deletedDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        return Math.max(0, 30 - daysPassed);
      };
      
      if (board.deleted_at) {
        const daysRemaining = calculateDaysRemaining(board.deleted_at);
        return (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-1 font-medium text-destructive text-xs">
              Deleted
            </span>
            <span className="text-muted-foreground text-xs">
              {daysRemaining} days left
            </span>
          </div>
        );
      }
      
      if (board.archived_at) {
        return (
          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground text-xs">
            Archived
          </span>
        );
      }
      
      return (
        <span className="inline-flex items-center rounded-full bg-dynamic-green/10 px-2.5 py-1 font-medium text-dynamic-green text-xs">
          Active
        </span>
      );
    },
  },
  {
    id: 'actions',
    header: ({ column }) => <DataTableColumnHeader t={t} column={column} />,
    cell: ({ row }) => <ProjectRowActions row={row} />,
  },
];
