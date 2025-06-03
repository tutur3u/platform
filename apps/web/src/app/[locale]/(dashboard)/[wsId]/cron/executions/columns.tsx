'use client';

import { RowActions } from './row-actions';
import { ColumnDef } from '@tanstack/react-table';
import type { WorkspaceCronExecution } from '@ncthub/types/db';
import { DataTableColumnHeader } from '@ncthub/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import Link from 'next/link';

export const getColumns = (
  t: any,
  namespace: string | undefined,
  _?: any,
  extraData?: any
): ColumnDef<WorkspaceCronExecution>[] => [
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
    accessorKey: 'job',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.job`)}
      />
    ),
    cell: ({ row }) => (
      <Link href={row.original.href || '#'} className="min-w-32">
        <span className="font-semibold hover:underline">
          {row.getValue('job') || '-'}
        </span>
      </Link>
    ),
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.status`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32">{row.getValue('status') || '-'}</div>
    ),
  },
  {
    accessorKey: 'started_at',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.started_at`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32">
        {moment(row.getValue('started_at')).format('DD/MM/YYYY HH:mm:ss')}
      </div>
    ),
  },
  {
    accessorKey: 'finished_at',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.finished_at`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32">
        {row.getValue('finished_at')
          ? moment(row.getValue('finished_at')).format('DD/MM/YYYY HH:mm:ss')
          : '-'}
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
