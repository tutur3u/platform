'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import Link from 'next/link';
import type { ManagedWorkspaceCronExecution } from '../types';
import { RowActions } from './row-actions';

export const getColumns = ({
  t,
  namespace,
  extraData,
}: ColumnGeneratorOptions<ManagedWorkspaceCronExecution>): ColumnDef<ManagedWorkspaceCronExecution>[] => [
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
    accessorKey: 'start_time',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.started_at`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32">
        {row.getValue('start_time')
          ? moment(row.getValue('start_time')).format('DD/MM/YYYY HH:mm:ss')
          : '-'}
      </div>
    ),
  },
  {
    accessorKey: 'end_time',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.finished_at`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-32">
        {row.getValue('end_time')
          ? moment(row.getValue('end_time')).format('DD/MM/YYYY HH:mm:ss')
          : '-'}
      </div>
    ),
  },
  {
    accessorKey: 'http_status',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.http_status`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-24">{row.getValue('http_status') || '-'}</div>
    ),
  },
  {
    accessorKey: 'duration_ms',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.duration_ms`)}
      />
    ),
    cell: ({ row }) => (
      <div className="min-w-24">
        {row.getValue('duration_ms')
          ? `${row.getValue('duration_ms')} ms`
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
