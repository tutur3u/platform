'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { User } from '@tuturuuu/types/primitives/User';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import Link from 'next/link';

export const userColumns = ({
  t,
}: ColumnGeneratorOptions<User>): ColumnDef<User>[] => [
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="ID" />
    ),
  },
  {
    accessorKey: 'display_name',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Name" />
    ),
    cell: ({ row }) => {
      const user = row.original;
      return (
        <Link
          href={user?.handle ? `/users/${user.handle}` : '#'}
          className="font-semibold hover:underline"
        >
          {user.display_name}
        </Link>
      );
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
        <span className="font-medium text-dynamic-blue">
          @{handle || 'No handle'}
        </span>
      );
    },
  },
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Email" />
    ),
    cell: ({ row }) => {
      const email = row.getValue('email') as string;
      return <span className="text-muted-foreground">{email || 'N/A'}</span>;
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
