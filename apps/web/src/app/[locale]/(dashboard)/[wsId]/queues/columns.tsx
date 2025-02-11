'use client';

import { RowActions } from './row-actions';
import { ColumnDef } from '@tanstack/react-table';
import type { WorkspaceCrawler } from '@tutur3u/types/db';
import { DataTableColumnHeader } from '@tutur3u/ui/components/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import Link from 'next/link';

export const getColumns = (
  t: any,
  namespace: string | undefined,
  _?: any,
  extraData?: any
): ColumnDef<WorkspaceCrawler>[] => [
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
      <div className="line-clamp-1 min-w-[8rem]">{row.getValue('id')}</div>
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
      <Link href={row.original.href || '#'} className="min-w-[8rem]">
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
      <div className="line-clamp-1 w-[8rem]">
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
      <div className="line-clamp-1 w-[2rem]">{row.getValue('columns')}</div>
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
      <div className="line-clamp-1 w-[2rem]">{row.getValue('rows')}</div>
    ),
  },
  {
    accessorKey: 'url',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.url`)}
      />
    ),
    cell: ({ row }) => (
      <Link
        href={row.getValue('url') || '#'}
        target={row.getValue('url') ? '_blank' : '_self'}
        className="min-w-[4rem]"
        rel="noreferrer"
      >
        <span className="line-clamp-1 font-semibold hover:underline">
          {row.getValue('url') || '-'}
        </span>
      </Link>
    ),
  },
  {
    accessorKey: 'type',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.type`)}
      />
    ),
    cell: ({ row }) => (
      <div className="font-semibold uppercase">{row.getValue('type')}</div>
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
      <div className="min-w-[8rem]">
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
