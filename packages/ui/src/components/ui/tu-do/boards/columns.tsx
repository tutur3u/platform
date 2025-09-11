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
        <div className="rounded bg-blue-500/10 p-1">
          <span className="font-medium text-blue-600 text-sm">
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
        <div className="rounded bg-green-500/10 p-1">
          <span className="font-medium text-green-600 text-sm">
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
        <div className="rounded bg-orange-500/10 p-1">
          <span className="font-medium text-orange-600 text-sm">
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
          className={`rounded p-1 ${
            (row.original.overdueTasks || 0) > 0
              ? 'bg-red-500/10'
              : 'bg-gray-500/10'
          }`}
        >
          <span
            className={`font-medium text-sm ${
              (row.original.overdueTasks || 0) > 0
                ? 'text-red-600'
                : 'text-gray-600'
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
    id: 'actions',
    header: ({ column }) => <DataTableColumnHeader t={t} column={column} />,
    cell: ({ row }) => <ProjectRowActions row={row} />,
  },
];
