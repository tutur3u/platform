'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { WorkspaceDataset } from '@tuturuuu/types';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import Link from 'next/link';
import { RowActions } from './row-actions';

export const getColumns = ({
  t,
  namespace,
  extraData,
}: ColumnGeneratorOptions<WorkspaceDataset> & {
  extraData?: any;
}): ColumnDef<WorkspaceDataset>[] => [
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
      <div className="line-clamp-1 min-w-32">{row.getValue('id')}</div>
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
      <Link href={row.original.href || '#'} className="min-w-32">
        <span className="font-semibold hover:underline">
          {row.getValue('name') || '-'}
        </span>
      </Link>
    ),
  },
  {
    accessorKey: 'description',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.description`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 w-32">
        {row.getValue('description') || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'columns',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.columns`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 w-8">{row.getValue('columns')}</div>
    ),
  },
  {
    accessorKey: 'rows',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.rows`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 w-8">{row.getValue('rows')}</div>
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
      <div className="min-w-32">
        {moment(row.getValue('created_at')).format('DD/MM/YYYY')}
      </div>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <RowActions row={row} href={row.original.href} extraData={extraData} />
    ),
  },
];
