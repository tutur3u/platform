'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Check, X } from '@tuturuuu/ui/icons';
import moment from 'moment';
import Link from 'next/link';
import { UserGroupRowActions } from './row-actions';

export const getUserGroupColumns = (
  t: (key: string) => string,
  namespace: string | undefined,
  extraData?: { wsId: string; groupId: string }
): ColumnDef<UserGroup>[] => [
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
    cell: ({ row }) => <div className="line-clamp-1">{row.getValue('id')}</div>,
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
      <Link href={row.original.href || '#'} className="min-w-32">
        {row.getValue('name') || '-'}
      </Link>
    ),
  },
  {
    accessorKey: 'amount',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.amount`)}
      />
    ),
    cell: ({ row }) => <div>{row.getValue('amount')}</div>,
  },
  {
    accessorKey: 'locked',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.locked`)}
      />
    ),
    cell: ({ row }) => <div>{row.getValue('locked') ? <Check /> : <X />}</div>,
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
    cell: ({ row }) => <UserGroupRowActions row={row} extraData={extraData} />,
  },
];
