'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, X } from '@tuturuuu/icons';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import Link from 'next/link';
import { UserGroupTagGroupRowActions } from './detail-row-actions';

type UserGroupColumnsOptions = ColumnGeneratorOptions<UserGroup> & {
  extraData?: {
    tagId: string;
    wsId: string;
  };
};

export const getTaggedUserGroupColumns = ({
  t,
  namespace,
  extraData,
}: UserGroupColumnsOptions): ColumnDef<UserGroup>[] => [
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
    cell: ({ row }) => (
      <UserGroupTagGroupRowActions row={row} extraData={extraData} />
    ),
  },
];
