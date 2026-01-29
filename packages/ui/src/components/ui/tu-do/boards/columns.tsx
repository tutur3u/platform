'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { getIconComponentByKey } from '@tuturuuu/ui/custom/icon-picker';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import Link from 'next/link';
import { BoardActions } from './row-actions';

export const projectColumns = ({
  t,
  namespace,
}: ColumnGeneratorOptions<WorkspaceTaskBoard>): ColumnDef<WorkspaceTaskBoard>[] => [
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
          <span className="inline-flex items-center gap-2">
            {(() => {
              const Icon = getIconComponentByKey(
                row.original.icon ?? undefined
              );
              return Icon ? (
                <Icon className="h-4 w-4 text-muted-foreground" />
              ) : null;
            })()}
            <span>{row.getValue('name') || '-'}</span>
          </span>
        </Link>
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
    cell: ({ row }) => <BoardActions board={row.original} />,
  },
];
