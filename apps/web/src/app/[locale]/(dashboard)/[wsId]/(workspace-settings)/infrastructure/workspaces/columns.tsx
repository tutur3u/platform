'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { Workspace } from '@tuturuuu/types';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';

export const workspaceColumns = ({
  t,
}: ColumnGeneratorOptions<Workspace>): ColumnDef<Workspace>[] => [
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="ID" />
    ),
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Workspace Name" />
    ),
    cell: ({ row }) => {
      const name = row.getValue('name') as string;
      return <span className="font-semibold">{name}</span>;
    },
  },
  {
    accessorKey: 'handle',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Handle" />
    ),
    cell: ({ row }) => {
      const handle = row.getValue('handle') as string;
      return (
        <span className="font-medium text-dynamic-purple">
          @{handle || 'No handle'}
        </span>
      );
    },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Created At" />
    ),
    cell: ({ row }) => {
      const date = row.getValue('created_at') as string;
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">{moment(date).format('MMM DD, YYYY')}</span>
          <span className="text-muted-foreground text-xs">
            {moment(date).format('HH:mm')}
          </span>
        </div>
      );
    },
  },
];
